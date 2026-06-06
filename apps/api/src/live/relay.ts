import {
  Modality,
  type FunctionCall,
  type FunctionResponse,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import type { WebSocket } from "@fastify/websocket";
import type { ClientMessage, ServerMessage } from "@auracle/shared";
import { config } from "../config.js";
import { createGeminiClient } from "../gemini/client.js";
import { allowGeminiDial, recordGeminiDial, recordGeminiStreamFault } from "../gemini/guard.js";
import type { SessionState } from "../session/store.js";
import type { ReplanParams, ReplanOutcome } from "../session/replan-service.js";
import { buildCueText, buildSystemInstruction, DJ_TOOLS, type CueInput, type CueTrack } from "./dj-prompt.js";
import { LiveToolRunner, type LiveToolRunnerDeps } from "./tool-runner.js";
import { type TranscriptionChunk, TranscriptAccumulator } from "./transcript.js";

export interface RelayDeps extends LiveToolRunnerDeps {
  replan(state: SessionState, params: ReplanParams): Promise<ReplanOutcome>;
}

const INPUT_MIME = "audio/pcm;rate=16000"; // browser mic, s16le mono 16kHz

/**
 * Bridge one browser WebSocket to one Gemini Live session for the lifetime of
 * the connection. Audio is relayed as raw binary both ways; transcripts, phase,
 * tool effects and errors are JSON frames (doc/auracle_api_protocol.md §Live).
 */
export async function attachLiveRelay(socket: WebSocket, state: SessionState, deps: RelayDeps): Promise<void> {
  const send = (msg: ServerMessage): void => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
  };

  if (!config.geminiApiKey) {
    send({ type: "error", message: "Live is unavailable: GEMINI_API_KEY is not set" });
    socket.close();
    return;
  }

  const liveGate = allowGeminiDial();
  if (!liveGate.allowed) {
    const retrySec = liveGate.decision.retryAfterMs
      ? Math.ceil(liveGate.decision.retryAfterMs / 1000)
      : undefined;
    send({
      type: "error",
      message: "Gemini circuit open — Live DJ paused; music playback continues",
      circuit_state: liveGate.decision.state,
      retry_after_sec: retrySec,
    });
    socket.close();
    return;
  }

  const tools = new LiveToolRunner(state, deps, send);
  const ai = createGeminiClient();
  let live: Session | undefined;
  let djSpeaking = false;
  let producedAudio = false;
  const sessionStartMs = Date.now();

  let ready = false;
  let clientCued = false;
  const preConnect: Array<{ raw: Buffer; isBinary: boolean }> = [];
  const transcripts = new TranscriptAccumulator();

  function buildCueFor(trackIndex: number): string {
    const total = state.tracklist.length;
    const kind: CueInput["kind"] = trackIndex <= 0 ? "opening" : trackIndex >= total - 1 ? "outro" : "segue";
    const now = toCueTrack(state.tracklist[trackIndex]?.id);
    const next = toCueTrack(state.tracklist[trackIndex + 1]?.id);
    return buildCueText({ kind, hostMode: state.hostMode, sessionTitle: state.title, now, next });
  }

  function toCueTrack(id: string | undefined): CueTrack | undefined {
    if (!id) return undefined;
    const t = deps.getTrack(id);
    if (!t) return undefined;
    return { title: t.title, energy: t.energy, tempo: t.tempo, genre: t.genre };
  }

  function sendCue(trackIndex: number): void {
    clientCued = true;
    live?.sendRealtimeInput({ text: buildCueFor(trackIndex) });
  }

  /** Gemini may attach transcription at the message root or under serverContent. */
  type GeminiMsg = LiveServerMessage & {
    inputTranscription?: TranscriptionChunk;
    outputTranscription?: TranscriptionChunk;
  };

  function relayTranscript(role: "user" | "model", chunk: TranscriptionChunk | undefined): void {
    const text = transcripts.ingest(role, chunk);
    if (text) send({ type: "transcript", role, text });
  }

  const onServerMessage = (msg: LiveServerMessage): void => {
    const gemini = msg as GeminiMsg;
    relayTranscript("user", gemini.inputTranscription);
    relayTranscript("model", gemini.outputTranscription);

    const sc = msg.serverContent;
    if (sc) {
      relayTranscript("user", sc.inputTranscription);
      relayTranscript("model", sc.outputTranscription);

      for (const part of sc.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (!data) continue;
        if (!djSpeaking) {
          djSpeaking = true;
          send({ type: "phase", phase: "dj_turn_start", track_index: state.currentTrackIndex });
        }
        if (socket.readyState === socket.OPEN) socket.send(Buffer.from(data, "base64"));
        producedAudio = true;
      }
      if (sc.interrupted) send({ type: "phase", phase: "user_barge_in", track_index: state.currentTrackIndex });
      if (sc.turnComplete) {
        transcripts.resetTurn();
        djSpeaking = false;
        send({ type: "phase", phase: "dj_turn_end", track_index: state.currentTrackIndex });
      }
    }
    const calls = msg.toolCall?.functionCalls;
    if (calls?.length) void handleToolCalls(calls);
  };

  async function handleToolCalls(calls: FunctionCall[]): Promise<void> {
    const responses: FunctionResponse[] = [];
    for (const call of calls) {
      responses.push({ id: call.id, name: call.name, response: await tools.run(call) });
    }
    live?.sendToolResponse({ functionResponses: responses });
  }

  function dispatch(raw: Buffer, isBinary: boolean): void {
    if (!ready) {
      preConnect.push({ raw, isBinary });
      return;
    }
    if (isBinary) {
      live?.sendRealtimeInput({ audio: { data: raw.toString("base64"), mimeType: INPUT_MIME } });
      return;
    }
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (parsed.type === "cue_dj") {
      sendCue(parsed.track_index);
    }
  }

  socket.on("message", (raw: Buffer, isBinary: boolean) => dispatch(raw, isBinary));
  socket.on("close", () => live?.close());

  try {
    live = await ai.live.connect({
      model: config.liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: buildSystemInstruction({
          title: state.title,
          subtitle: state.subtitle,
          total: state.tracklist.length,
          mem0Context: state.mem0Context,
          condition: state.condition,
          hostMode: state.hostMode,
          mood: state.intent.mood,
          scene: state.intent.scene,
        }),
        tools: [{ functionDeclarations: DJ_TOOLS }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: onServerMessage,
        onerror: (e) => {
          recordGeminiStreamFault(sessionStartMs, producedAudio, e);
          send({ type: "error", message: e.message || "Gemini Live error" });
        },
        onclose: () => {
          if (socket.readyState === socket.OPEN) socket.close();
        },
      },
    });
    recordGeminiDial(null);
  } catch (err) {
    recordGeminiDial(err);
    send({ type: "error", message: `Live connect failed: ${(err as Error).message}` });
    socket.close();
    return;
  }

  ready = true;
  for (const f of preConnect) dispatch(f.raw, f.isBinary);
  preConnect.length = 0;

  // StrictMode remounts can drop the opening cue_dj; ensure the current track is cued once Live is up.
  if (!clientCued) sendCue(state.currentTrackIndex);
}
