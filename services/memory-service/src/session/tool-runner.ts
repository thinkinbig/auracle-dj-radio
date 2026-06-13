import type { ServerMessage } from "@auracle/shared";
import { parseHostMode } from "@auracle/shared";
import type { SessionState } from "./store.js";
import { applyReplan, type OrchestrationDeps } from "./replan.js";

/** Gemini function call forwarded from the proxy (Lane 1). */
export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

/**
 * Lane-1 envelope: `gemini_result` goes back to Gemini as the tool response;
 * `ui_events` are pushed to the browser over the data channel. memory-service
 * is the only Gemini-facing business path (refactor-three-services).
 */
export interface ToolEnvelope {
  gemini_result: Record<string, unknown>;
  ui_events: ServerMessage[];
}

/** Dispatch a Gemini Live function call to session side-effects (intents, replan, mem0). */
export async function runTool(
  deps: OrchestrationDeps,
  state: SessionState,
  call: ToolCall,
): Promise<ToolEnvelope> {
  const args = call.args ?? {};
  switch (call.name) {
    case "skip_track": {
      deps.events.recordEvent(state.id, "skip_track", {});
      // Browser is the sole playhead writer: this ui_event makes it advance, and the
      // next now_playing closes the loop. Stamp the start to time that round trip.
      state.pendingSkipAtMs = Date.now();
      return { gemini_result: { ok: true }, ui_events: [{ type: "intent", intent: { type: "skip_track" } }] };
    }
    case "pause_playback": {
      const action = args.action === "resume" ? "resume" : "pause";
      deps.events.recordEvent(state.id, "pause_playback", { action });
      return {
        gemini_result: { ok: true, action },
        ui_events: [{ type: "intent", intent: { type: "pause_playback", action } }],
      };
    }
    case "record_preference": {
      const fact = String(args.fact ?? "");
      deps.events.recordEvent(state.id, "record_preference", { fact });
      // mem0 write is cold IO — never block the tool response on it (hot/cold).
      if (state.condition === "C") void deps.memory.remember(fact, state.id);
      return {
        gemini_result: { ok: true },
        ui_events: [{ type: "intent", intent: { type: "record_preference", fact } }],
      };
    }
    case "change_host_mode": {
      const nextMode = parseHostMode(args.host_mode);
      if (!nextMode) return { gemini_result: { ok: false, error: "invalid host_mode" }, ui_events: [] };
      const previous = state.hostMode;
      if (nextMode === previous) {
        return { gemini_result: { ok: true, host_mode: previous, changed: false }, ui_events: [] };
      }
      state.hostMode = nextMode;
      deps.events.recordEvent(state.id, "change_host_mode", { host_mode: nextMode, previous });
      return {
        gemini_result: {
          ok: true,
          host_mode: nextMode,
          previous,
          changed: true,
          note: "Adopt the new speaking style immediately; playlist unchanged.",
        },
        ui_events: [{ type: "intent", intent: { type: "host_mode_changed", host_mode: nextMode } }],
      };
    }
    case "mood_change": {
      const mood = String(args.mood ?? state.intent.mood);
      const energy_delta = (args.energy_delta as "lighter" | "heavier" | "same") ?? "same";
      const ui_events: ServerMessage[] = [
        { type: "intent", intent: { type: "mood_change", mood, energy_delta } },
      ];
      // Phase 2 runs the replan inline and returns tracklist_updated in this same
      // envelope. Phase 3 splits it: ack here (Lane 1) + async tracklist_updated
      // pushed via the proxy when the slow Flow LLM lands (Lane 3), so the DJ never
      // waits on the replan (see perf-first-start / refactor-three-services).
      const outcome = await applyReplan(deps, state, { mood, energy_delta });
      if (outcome.replanned) {
        ui_events.push({
          type: "tracklist_updated",
          remaining: outcome.remaining,
          session_title: state.title,
          session_subtitle: state.subtitle,
        });
      }
      return {
        gemini_result: {
          ok: true,
          note: "Adjusting the next tracks now — keep talking, don't wait for the list.",
        },
        ui_events,
      };
    }
    default:
      return { gemini_result: { ok: false, error: `unknown tool: ${call.name || "?"}` }, ui_events: [] };
  }
}
