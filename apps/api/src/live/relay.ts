import type { FunctionCall, FunctionResponse } from "@google/genai";
import type { WebSocket } from "@fastify/websocket";
import type { ClientMessage, ServerMessage } from "@auracle/shared";
import { config } from "../config.js";
import { allowGeminiDial, recordGeminiDial } from "../gemini/guard.js";
import type { SessionState } from "../session/store.js";
import type { ReplanParams, ReplanOutcome } from "../session/replan-service.js";
import { LiveToolRunner, type LiveToolRunnerDeps } from "./tool-runner.js";
import { LiveVoiceChannel } from "./voice-channel.js";

export interface RelayDeps extends LiveToolRunnerDeps {
  replan(state: SessionState, params: ReplanParams): Promise<ReplanOutcome>;
  /** Subscribe to the background plan refine; fires (or replays) when the LLM arc lands. */
  subscribeRefine(state: SessionState, listener: () => void): () => void;
}

/**
 * Bridge one browser WebSocket to one Gemini Live session for the lifetime of the
 * connection. This is the thin orchestrator: the HOT path (mic/DJ audio, phase,
 * transcript, cue/skip) lives in {@link LiveVoiceChannel}; the COLD path (tool
 * effects — replan/mem0/db) runs off the media loop via `runToolsCold` and returns
 * its result to Gemini only when ready (doc/auracle_api_protocol.md §Live).
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

  // COLD path: a Gemini tool call runs off the media loop; its result returns to
  // Gemini through the voice channel when ready, so audio is never blocked on
  // replan/mem0/db (CONTEXT: hot/cold split).
  const runToolsCold = (calls: FunctionCall[]): void => {
    void (async () => {
      const responses: FunctionResponse[] = [];
      for (const call of calls) {
        responses.push({ id: call.id, name: call.name, response: await tools.run(call) });
      }
      voice.sendToolResponse(responses);
    })();
  };

  // HOT path: the Gemini Live media session.
  const voice = new LiveVoiceChannel(state, deps, {
    sendFrame: send,
    sendAudio: (pcm) => {
      if (socket.readyState === socket.OPEN) socket.send(pcm);
    },
    onToolCall: runToolsCold,
    onClosed: () => {
      if (socket.readyState === socket.OPEN) socket.close();
    },
  });

  let ready = false;
  const preConnect: Array<{ raw: Buffer; isBinary: boolean }> = [];

  function dispatch(raw: Buffer, isBinary: boolean): void {
    if (!ready) {
      preConnect.push({ raw, isBinary });
      return;
    }
    if (isBinary) {
      voice.sendMicAudio(raw);
      return;
    }
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (parsed.type === "cue_dj") {
      voice.cue(parsed.track_index, parsed.kind);
    } else if (parsed.type === "skip_dj") {
      voice.skip();
    } else if (parsed.type === "now_playing") {
      // Mirror the browser-owned Playhead so replan/tracklist target the right track.
      state.currentTrackIndex = parsed.track_index;
    }
  }

  // Background plan refine (provisional → real Flow arc): push the upgraded
  // tracklist + revealed session title once it lands (replayed if already done).
  const unsubscribeRefine = deps.subscribeRefine(state, () => {
    send({
      type: "tracklist_updated",
      remaining: state.tracklist.slice(state.currentTrackIndex + 1),
      session_title: state.title,
      session_subtitle: state.subtitle,
    });
  });

  socket.on("message", (raw: Buffer, isBinary: boolean) => dispatch(raw, isBinary));
  socket.on("close", () => {
    unsubscribeRefine();
    voice.close();
  });

  try {
    await voice.connect();
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
  if (!voice.hasCued) voice.cue(state.currentTrackIndex);
}
