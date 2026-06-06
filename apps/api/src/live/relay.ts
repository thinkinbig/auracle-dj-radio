import {
  GoogleGenAI,
  Modality,
  type FunctionCall,
  type FunctionResponse,
  type LiveServerMessage,
  type Session,
} from "@google/genai";
import type { WebSocket } from "@fastify/websocket";
import type { ClientMessage, Intent, ServerMessage } from "@auracle/shared";
import { config } from "../config.js";
import type { MemoryClient } from "../memory/client.js";
import type { SessionState } from "../session/store.js";
import type { ReplanParams, ReplanOutcome } from "../session/replan-service.js";
import { buildCueText, buildSystemInstruction, DJ_TOOLS, type CueInput, type CueTrack } from "./dj-prompt.js";

export interface RelayDeps {
  recordEvent(sessionId: string, eventType: string, payload: Record<string, unknown>): void;
  getTrack(id: string): { title: string; energy: number; tempo: number; genre: string } | undefined;
  memory: MemoryClient;
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

  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  let live: Session | undefined;
  let djSpeaking = false;

  // Frames can arrive before ai.live.connect() resolves; buffer them so the
  // opening cue isn't dropped, then flush in order once the session is ready.
  let ready = false;
  const preConnect: Array<{ raw: Buffer; isBinary: boolean }> = [];

  const onServerMessage = (msg: LiveServerMessage): void => {
    const sc = msg.serverContent;
    if (sc) {
      for (const part of sc.modelTurn?.parts ?? []) {
        const data = part.inlineData?.data;
        if (!data) continue;
        if (!djSpeaking) {
          djSpeaking = true;
          send({ type: "phase", phase: "dj_turn_start", track_index: state.currentTrackIndex });
        }
        if (socket.readyState === socket.OPEN) socket.send(Buffer.from(data, "base64")); // 24kHz PCM
      }
      if (sc.outputTranscription?.text) send({ type: "transcript", role: "model", text: sc.outputTranscription.text });
      if (sc.inputTranscription?.text) send({ type: "transcript", role: "user", text: sc.inputTranscription.text });
      if (sc.interrupted) send({ type: "phase", phase: "user_barge_in", track_index: state.currentTrackIndex });
      if (sc.turnComplete) {
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
      responses.push({ id: call.id, name: call.name, response: await runTool(call) });
    }
    live?.sendToolResponse({ functionResponses: responses });
  }

  async function runTool(call: FunctionCall): Promise<Record<string, unknown>> {
    const args = call.args ?? {};
    switch (call.name) {
      case "skip_track": {
        const intent: Intent = { type: "skip_track" };
        deps.recordEvent(state.id, "skip_track", {});
        send({ type: "intent", intent });
        return { ok: true };
      }
      case "pause_playback": {
        const action = args.action === "resume" ? "resume" : "pause";
        const intent: Intent = { type: "pause_playback", action };
        deps.recordEvent(state.id, "pause_playback", { action });
        send({ type: "intent", intent });
        return { ok: true, action };
      }
      case "record_preference": {
        const fact = String(args.fact ?? "");
        deps.recordEvent(state.id, "record_preference", { fact });
        send({ type: "intent", intent: { type: "record_preference", fact } });
        // Only Condition C persists to mem0 (A/B keep the tool but no-op the write).
        if (state.condition === "C") await deps.memory.remember(fact, state.id);
        return { ok: true };
      }
      case "mood_change": {
        const mood = String(args.mood ?? state.intent.mood);
        const energy_delta = (args.energy_delta as "lighter" | "heavier" | "same") ?? "same";
        send({ type: "intent", intent: { type: "mood_change", mood, energy_delta } });
        const outcome = await deps.replan(state, { mood, energy_delta });
        send({ type: "tracklist_updated", remaining: outcome.remaining });
        const next = outcome.remaining[0];
        const nextTrack = next ? deps.getTrack(next.id) : undefined;
        return {
          ok: outcome.replanned,
          session_title: state.title,
          next_track: nextTrack?.title ?? null,
        };
      }
      default:
        return { ok: false, error: `unknown tool: ${call.name ?? "?"}` };
    }
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
      live?.sendRealtimeInput({ text: buildCueFor(parsed.track_index) });
    }
    // "ping" is a no-op keepalive.
  }

  // Register listeners before connecting so early frames are captured, not lost.
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
        }),
        tools: [{ functionDeclarations: DJ_TOOLS }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: onServerMessage,
        onerror: (e) => send({ type: "error", message: e.message || "Gemini Live error" }),
        onclose: () => {
          if (socket.readyState === socket.OPEN) socket.close();
        },
      },
    });
  } catch (err) {
    send({ type: "error", message: `Live connect failed: ${(err as Error).message}` });
    socket.close();
    return;
  }

  // Session is ready: drain anything buffered during connect, then go live.
  ready = true;
  for (const f of preConnect) dispatch(f.raw, f.isBinary);
  preConnect.length = 0;

  function buildCueFor(trackIndex: number): string {
    const total = state.tracklist.length;
    const kind: CueInput["kind"] = trackIndex <= 0 ? "opening" : trackIndex >= total - 1 ? "outro" : "segue";
    const now = toCueTrack(state.tracklist[trackIndex]?.id);
    const next = toCueTrack(state.tracklist[trackIndex + 1]?.id);
    return buildCueText({ kind, sessionTitle: state.title, now, next });
  }

  function toCueTrack(id: string | undefined): CueTrack | undefined {
    if (!id) return undefined;
    const t = deps.getTrack(id);
    if (!t) return undefined;
    return { title: t.title, energy: t.energy, tempo: t.tempo, genre: t.genre };
  }
}
