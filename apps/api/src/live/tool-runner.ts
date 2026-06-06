import type { FunctionCall } from "@google/genai";
import type { HostMode, Intent, ServerMessage } from "@auracle/shared";
import { parseHostMode } from "@auracle/shared";
import type { MemoryClient } from "../memory/client.js";
import type { SessionState } from "../session/store.js";
import type { ReplanParams, ReplanOutcome } from "../session/replan-service.js";

export interface LiveToolRunnerDeps {
  recordEvent(sessionId: string, eventType: string, payload: Record<string, unknown>): void;
  getTrack(id: string):
    | { title: string; artist: string; albumTitle: string; energy: number; tempo: number; genre: string; lore: string }
    | undefined;
  memory: MemoryClient;
  replan(state: SessionState, params: ReplanParams): Promise<ReplanOutcome>;
}

/** Dispatches Gemini Live function calls to session side-effects (intents, replan, mem0). */
export class LiveToolRunner {
  constructor(
    private readonly state: SessionState,
    private readonly deps: LiveToolRunnerDeps,
    private readonly send: (msg: ServerMessage) => void,
  ) {}

  async run(call: FunctionCall): Promise<Record<string, unknown>> {
    const args = call.args ?? {};
    switch (call.name) {
      case "skip_track": {
        const intent: Intent = { type: "skip_track" };
        this.deps.recordEvent(this.state.id, "skip_track", {});
        this.send({ type: "intent", intent });
        return { ok: true };
      }
      case "pause_playback": {
        const action = args.action === "resume" ? "resume" : "pause";
        const intent: Intent = { type: "pause_playback", action };
        this.deps.recordEvent(this.state.id, "pause_playback", { action });
        this.send({ type: "intent", intent });
        return { ok: true, action };
      }
      case "record_preference": {
        const fact = String(args.fact ?? "");
        this.deps.recordEvent(this.state.id, "record_preference", { fact });
        this.send({ type: "intent", intent: { type: "record_preference", fact } });
        if (this.state.condition === "C") await this.deps.memory.remember(fact, this.state.id);
        return { ok: true };
      }
      case "mood_change": {
        const mood = String(args.mood ?? this.state.intent.mood);
        const energy_delta = (args.energy_delta as "lighter" | "heavier" | "same") ?? "same";
        this.send({ type: "intent", intent: { type: "mood_change", mood, energy_delta } });
        const outcome = await this.deps.replan(this.state, { mood, energy_delta });
        this.send({ type: "tracklist_updated", remaining: outcome.remaining });
        const next = outcome.remaining[0];
        const nextTrack = next ? this.deps.getTrack(next.id) : undefined;
        return {
          ok: outcome.replanned,
          session_title: this.state.title,
          next_track: nextTrack?.title ?? null,
        };
      }
      case "change_host_mode": {
        const nextMode = parseHostMode(args.host_mode);
        if (!nextMode) return { ok: false, error: "invalid host_mode" };
        const previous: HostMode = this.state.hostMode;
        if (nextMode === previous) {
          return { ok: true, host_mode: previous, changed: false };
        }
        this.state.hostMode = nextMode;
        this.deps.recordEvent(this.state.id, "change_host_mode", { host_mode: nextMode, previous });
        this.send({ type: "intent", intent: { type: "host_mode_changed", host_mode: nextMode } });
        return {
          ok: true,
          host_mode: nextMode,
          previous,
          changed: true,
          note: "Adopt the new speaking style immediately; playlist unchanged.",
        };
      }
      default:
        return { ok: false, error: `unknown tool: ${call.name ?? "?"}` };
    }
  }
}
