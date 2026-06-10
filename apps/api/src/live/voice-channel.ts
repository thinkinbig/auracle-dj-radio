import {
  Modality,
  type FunctionResponse,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import type { ServerMessage } from "@auracle/shared";
import { config } from "../config.js";
import { createGeminiClient } from "../gemini/client.js";
import { recordGeminiStreamFault } from "../gemini/guard.js";
import type { SessionState } from "../session/store.js";
import {
  buildCueText,
  buildSystemInstruction,
  DJ_TOOLS,
  type CueInput,
  type CueKind,
  type CueTrack,
} from "./dj-prompt.js";
import { type TranscriptionChunk, TranscriptAccumulator } from "./transcript.js";

const INPUT_MIME = "audio/pcm;rate=16000"; // browser mic, s16le mono 16kHz

export interface VoiceChannelDeps {
  getTrack(id: string):
    | { title: string; artist: string; albumTitle: string; energy: number; tempo: number; genre: string; lore: string }
    | undefined;
}

/**
 * What the hot media path emits outward. The single cold seam is `onToolCall`:
 * everything else here is latency-critical and must never wait on session IO.
 */
export interface VoiceChannelHooks {
  /** JSON control frame out (phase, transcript, error). */
  sendFrame(msg: ServerMessage): void;
  /** Raw DJ voice PCM out (24kHz s16le mono). */
  sendAudio(pcm: Buffer): void;
  /** COLD seam: Gemini asked for a tool — hand it off; never block the media loop. */
  onToolCall(calls: NonNullable<NonNullable<LiveServerMessage["toolCall"]>["functionCalls"]>): void;
  /** Gemini's session closed. */
  onClosed(): void;
}

/** Gemini may attach transcription at the message root or under serverContent. */
type GeminiMsg = LiveServerMessage & {
  inputTranscription?: TranscriptionChunk;
  outputTranscription?: TranscriptionChunk;
};

/**
 * The hot path: one Gemini Live media session. Forwards mic PCM up, DJ PCM down,
 * emits phase/transcript frames, and drives DJ turns (cue/skip). It performs NO
 * session side-effects (replan/mem0/db) — those are the cold path, reached only
 * through `hooks.onToolCall` and completed via `sendToolResponse`.
 */
export class LiveVoiceChannel {
  private live?: Session;
  private djSpeaking = false;
  // Listener skipped the current voice-over; swallow its remaining audio/transcript.
  private djSkipped = false;
  private produced = false;
  private cued = false;
  // The Playhead the in-flight DJ turn was cued at; phase frames are stamped with
  // it so a turn for an earlier track can't act on a later one (CONTEXT: Playhead).
  private cueIndex: number;
  private readonly transcripts = new TranscriptAccumulator();
  private readonly startedMs = Date.now();

  constructor(
    private readonly state: SessionState,
    private readonly deps: VoiceChannelDeps,
    private readonly hooks: VoiceChannelHooks,
  ) {
    this.cueIndex = state.currentTrackIndex;
  }

  /** Whether any cue has been sent (the relay uses this for its fallback opening cue). */
  get hasCued(): boolean {
    return this.cued;
  }

  /** Whether the session ever produced audio (circuit-breaker fault classification). */
  get producedAudio(): boolean {
    return this.produced;
  }

  /** Open the Gemini Live session. Throws on connect failure. */
  async connect(): Promise<void> {
    const ai = createGeminiClient();
    this.live = await ai.live.connect({
      model: config.liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildSystemInstruction({
          title: this.state.title,
          subtitle: this.state.subtitle,
          total: this.state.tracklist.length,
          mem0Context: this.state.mem0Context,
          condition: this.state.condition,
          hostMode: this.state.hostMode,
          mood: this.state.intent.mood,
          scene: this.state.intent.scene,
        }),
        tools: [{ functionDeclarations: DJ_TOOLS }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: (m) => this.handleServerMessage(m),
        onerror: (e) => {
          recordGeminiStreamFault(this.startedMs, this.produced, e);
          this.hooks.sendFrame({ type: "error", message: e.message || "Gemini Live error" });
        },
        onclose: () => this.hooks.onClosed(),
      },
    });
  }

  /** Forward a mic PCM frame up to Gemini. */
  sendMicAudio(raw: Buffer): void {
    this.live?.sendRealtimeInput({ audio: { data: raw.toString("base64"), mimeType: INPUT_MIME } });
  }

  /** Start a DJ turn for `trackIndex` (opening/segue/outro auto-picked unless overridden). */
  cue(trackIndex: number, kind?: CueKind): void {
    this.cued = true;
    this.cueIndex = trackIndex; // this turn belongs to trackIndex; phases stamp it
    this.djSkipped = false; // a fresh cue starts a turn we want the listener to hear
    this.live?.sendRealtimeInput({ text: this.buildCueFor(trackIndex, kind) });
  }

  /**
   * Listener skipped the voice-over: stop forwarding the current turn's audio and
   * transcript, report it as a normal turn end (not a barge-in, so the UI returns
   * to playing), and best-effort interrupt Gemini to save tokens.
   */
  skip(): void {
    if (!this.djSpeaking || this.djSkipped) return;
    this.djSkipped = true;
    this.djSpeaking = false;
    this.transcripts.resetTurn();
    this.hooks.sendFrame({ type: "phase", phase: "dj_turn_end", track_index: this.cueIndex });
    try {
      this.live?.sendClientContent({ turnComplete: false });
    } catch {
      /* best-effort interrupt; suppression already protects the client */
    }
  }

  /** Complete a cold-path tool call back to Gemini. */
  sendToolResponse(functionResponses: FunctionResponse[]): void {
    this.live?.sendToolResponse({ functionResponses });
  }

  close(): void {
    this.live?.close();
  }

  handleServerMessage(msg: LiveServerMessage): void {
    const gemini = msg as GeminiMsg;
    this.relayTranscript("user", gemini.inputTranscription);
    if (!this.djSkipped) this.relayTranscript("model", gemini.outputTranscription);

    const sc = msg.serverContent;
    if (sc) {
      this.relayTranscript("user", sc.inputTranscription);
      if (!this.djSkipped) {
        this.relayTranscript("model", sc.outputTranscription);

        for (const part of sc.modelTurn?.parts ?? []) {
          const data = part.inlineData?.data;
          if (!data) continue;
          if (!this.djSpeaking) {
            this.djSpeaking = true;
            this.hooks.sendFrame({ type: "phase", phase: "dj_turn_start", track_index: this.cueIndex });
          }
          this.hooks.sendAudio(Buffer.from(data, "base64"));
          this.produced = true;
        }
        if (sc.interrupted) {
          // Gemini abandoned this turn because the user spoke. Clear djSpeaking so
          // the NEXT turn's first audio frame re-emits dj_turn_start — otherwise the
          // DJ never visibly/ducks-wise starts again for the rest of the session.
          this.djSpeaking = false;
          this.hooks.sendFrame({ type: "phase", phase: "user_barge_in", track_index: this.cueIndex });
        }
      }
      if (sc.turnComplete) {
        this.transcripts.resetTurn();
        this.djSpeaking = false;
        // The skip already emitted dj_turn_end; just clear suppression once the turn drains.
        if (this.djSkipped) this.djSkipped = false;
        else this.hooks.sendFrame({ type: "phase", phase: "dj_turn_end", track_index: this.cueIndex });
      }
    }
    const calls = msg.toolCall?.functionCalls;
    if (calls?.length) this.hooks.onToolCall(calls);
  }

  private relayTranscript(role: "user" | "model", chunk: TranscriptionChunk | undefined): void {
    const text = this.transcripts.ingest(role, chunk);
    if (text) this.hooks.sendFrame({ type: "transcript", role, text });
  }

  private buildCueFor(trackIndex: number, kindOverride?: CueKind): string {
    const total = this.state.tracklist.length;
    const kind: CueInput["kind"] =
      kindOverride ?? (trackIndex <= 0 ? "opening" : trackIndex >= total - 1 ? "outro" : "segue");
    return buildCueText({
      kind,
      hostMode: this.state.hostMode,
      sessionTitle: this.state.title,
      now: this.toCueTrack(this.state.tracklist[trackIndex]?.id),
      next: this.toCueTrack(this.state.tracklist[trackIndex + 1]?.id),
    });
  }

  private toCueTrack(id: string | undefined): CueTrack | undefined {
    if (!id) return undefined;
    const t = this.deps.getTrack(id);
    if (!t) return undefined;
    return {
      title: t.title,
      artist: t.artist,
      albumTitle: t.albumTitle,
      energy: t.energy,
      tempo: t.tempo,
      genre: t.genre,
      lore: t.lore,
    };
  }
}
