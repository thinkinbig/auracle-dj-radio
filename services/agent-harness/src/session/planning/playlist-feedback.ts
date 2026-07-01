import type { PlaylistFeedback, PlaylistFeedbackSource, RegenerateSessionResponse, ServerMessage } from "@auracle/shared";
import type { OrchestrationDeps } from "../deps.js";
import type { SessionState } from "../state.js";
import { regenerateAndPush, regenerateRemaining, toRegenerateSessionResponse } from "./replan.js";

export interface PlaylistFeedbackOutcome {
  gemini_result: Record<string, unknown>;
  ui_events: ServerMessage[];
  /** Populated for UI-initiated regenerate (HTTP delivery). */
  regenerate?: RegenerateSessionResponse;
}

export function parsePlaylistFeedback(raw: unknown): PlaylistFeedback | null {
  if (raw === "like" || raw === "dislike" || raw === "regenerate") return raw;
  return null;
}

/** Single server path for Like / Dislike / Regenerate — UI HTTP and DJ tool. */
export async function runPlaylistFeedback(
  deps: OrchestrationDeps,
  state: SessionState,
  feedback: PlaylistFeedback,
  source: PlaylistFeedbackSource,
): Promise<PlaylistFeedbackOutcome> {
  const trackId = state.tracklist[state.currentTrackIndex]?.id ?? null;
  const remainingIds = state.tracklist.slice(state.currentTrackIndex + 1).map((track) => track.id);
  await deps.memory.recordEvent(state.id, state.userId, "playlist_feedback", {
    feedback,
    track_id: trackId,
    remaining_ids: remainingIds,
    source,
  });

  const ui_events: ServerMessage[] = [{ type: "intent", intent: { type: "playlist_feedback", feedback } }];

  if (feedback !== "regenerate") {
    return { gemini_result: { ok: true, feedback }, ui_events };
  }

  if (source === "dj_tool") {
    void regenerateAndPush(deps, state, source);
    return {
      gemini_result: {
        ok: true,
        feedback,
        note: "Rebuilding the upcoming queue now — keep talking, don't wait for the list.",
      },
      ui_events,
    };
  }

  const outcome = await regenerateRemaining(deps, state);
  await deps.memory.recordEvent(state.id, state.userId, "playlist_regenerate_requested", {
    current_track_id: trackId,
    before: outcome.before,
    after: outcome.remaining.map((track) => track.id),
    replanned: outcome.replanned,
    source,
  });
  return {
    gemini_result: { ok: true, feedback, replanned: outcome.replanned },
    ui_events,
    regenerate: toRegenerateSessionResponse(state, outcome),
  };
}
