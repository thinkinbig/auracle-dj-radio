import { parseHostMode, type ServerMessage } from "@auracle/shared";
import type { OrchestrationDeps } from "./deps.js";
import { changeHostMode } from "./lifecycle/host-mode.js";
import type { SessionState } from "./state.js";
import { routeMoodScope } from "./planning/mood-scope.js";
import { runSkipTrack } from "./lifecycle/skip-track.js";
import { parsePlaylistFeedback, runPlaylistFeedback } from "./planning/playlist-feedback.js";
import { replanAndPush } from "./planning/replan.js";

/** Gemini function call forwarded from the proxy (Lane 1). */
export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

/**
 * Lane-1 envelope: `gemini_result` goes back to Gemini as the tool response;
 * `ui_events` are pushed to the browser over the data channel. agent-harness
 * is the only Gemini-facing business path.
 */
export interface ToolEnvelope {
  gemini_result: Record<string, unknown>;
  ui_events: ServerMessage[];
}

/** Dispatch a Gemini Live function call to session side-effects (intents, replan, events). */
export async function runTool(
  deps: OrchestrationDeps,
  state: SessionState,
  call: ToolCall,
): Promise<ToolEnvelope> {
  const args = call.args ?? {};
  switch (call.name) {
    case "skip_track":
      return runSkipTrack(deps, state, "dj_tool");
    case "pause_playback": {
      const action = args.action === "resume" ? "resume" : "pause";
      await deps.profile.recordEvent(state.id, state.userId, "pause_playback", { action });
      return {
        gemini_result: { ok: true, action },
        ui_events: [{ type: "intent", intent: { type: "pause_playback", action } }],
      };
    }
    case "change_host_mode": {
      const nextMode = parseHostMode(args.host_mode);
      if (!nextMode) return { gemini_result: { ok: false, error: "invalid host_mode" }, ui_events: [] };
      const outcome = await changeHostMode(deps, state, nextMode, "dj_tool");
      return {
        gemini_result: {
          ok: true,
          host_mode: outcome.host_mode,
          previous: outcome.previous,
          changed: outcome.changed,
          ...(outcome.note ? { note: outcome.note } : {}),
        },
        ui_events: outcome.changed
          ? [{ type: "intent", intent: { type: "host_mode_changed", host_mode: outcome.host_mode } }]
          : [],
      };
    }
    case "playlist_feedback": {
      const feedback = parsePlaylistFeedback(args.feedback);
      if (!feedback) {
        return { gemini_result: { ok: false, error: "feedback must be like, dislike, or regenerate" }, ui_events: [] };
      }
      return runPlaylistFeedback(deps, state, feedback, "dj_tool");
    }
    case "mood_change": {
      const mood = String(args.mood ?? state.intent.mood);
      const energy_delta = (args.energy_delta as "lighter" | "heavier" | "same") ?? "same";
      if (state.skipOnlyUntilMs != null && Date.now() < state.skipOnlyUntilMs) {
        return {
          gemini_result: {
            ok: true,
            ignored: true,
            reason: "skip_only_guard",
            note: "Skip was already handled. Do not announce playlist changes unless the user explicitly asked for a new mood or energy.",
          },
          ui_events: [],
        };
      }
      // Route the tier (E5): an energy-only tweak or a minor mood wording stays a
      // nudge (next 1–2 slots); a significantly different mood steers the latter
      // half. full scope is used by playlist_feedback regenerate.
      const scope = routeMoodScope(state.intent.mood, mood, energy_delta);
      // Ack now (Lane 1) and run the slow Flow-LLM replan in the background; the
      // new tracklist is pushed via the proxy (Lane 3) when it lands, so the DJ
      // never waits on the replan (see perf-first-start / refactor-three-services).
      void replanAndPush(deps, state, { mood, energy_delta, scope });
      return {
        gemini_result: {
          ok: true,
          note: "Adjusting the next tracks now — keep talking, don't wait for the list.",
        },
        ui_events: [{ type: "intent", intent: { type: "mood_change", mood, energy_delta } }],
      };
    }
    default:
      return { gemini_result: { ok: false, error: `unknown tool: ${call.name || "?"}` }, ui_events: [] };
  }
}
