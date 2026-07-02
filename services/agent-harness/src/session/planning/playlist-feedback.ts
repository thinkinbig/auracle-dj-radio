import { ANONYMOUS_USER_ID, type PlaylistFeedback, type PlaylistFeedbackSource, type RegenerateSessionResponse, type ServerMessage } from "@auracle/shared";
import type { OrchestrationDeps } from "../deps.js";
import type { SessionState } from "../state.js";
import { regenerateAndPush, regenerateRemaining, replanAndPush, toRegenerateSessionResponse } from "./replan.js";
import { mergeSessionTaste } from "./session-taste.js";

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
    // Close the loop (#68/#69) off the hot path: derive/persist taste, then
    // nudge the upcoming slots. The DJ never waits on either (Lane 3).
    void applyFeedbackEffects(deps, state, feedback, trackId);
    return {
      gemini_result: {
        ok: true,
        feedback,
        note: "Noted — the upcoming picks will lean accordingly. Acknowledge briefly; don't announce a playlist rebuild.",
      },
      ui_events,
    };
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

/**
 * Background like/dislike effects (Lane 3), closing the feedback loop the eval
 * series flagged as telemetry-only (#68/#69):
 *
 * 1. memory-service derives the track+artist prefs the reaction rolls up to,
 *    persisting them (+ mem0 mirror) only for a logged-in condition-C user.
 *    The derived prefs are merged into `state.sessionTaste` either way, so the
 *    signal shifts this session's queue in B and C alike. Deduped per
 *    (feedback, track) against DJ tool double-fires.
 * 2. A nudge replan re-fills the next 1–2 slots under the current mood with
 *    the updated taste. A dislike re-rolls (fresh seed + avoid the replaced
 *    occupants) so the immediate next slots demonstrably change; a like keeps
 *    the deterministic seed and lets the prefer weights re-rank.
 *
 * Failures record an event and leave the queue as-is — the feedback telemetry
 * (#66) was already written by the caller.
 */
async function applyFeedbackEffects(
  deps: OrchestrationDeps,
  state: SessionState,
  feedback: "like" | "dislike",
  trackId: string | null,
): Promise<void> {
  if (trackId) {
    const dedupeKey = `${feedback}:${trackId}`;
    if (!state.tasteFeedbackSent.has(dedupeKey)) {
      state.tasteFeedbackSent.add(dedupeKey);
      try {
        const prefs = await deps.memory.sessionTasteFeedback({
          sessionId: state.id,
          userId: state.userId,
          trackId,
          feedback,
          persist: state.condition === "C" && state.userId !== ANONYMOUS_USER_ID,
        });
        mergeSessionTaste(state, prefs);
      } catch (err) {
        await deps.memory
          .recordEvent(state.id, state.userId, "taste_feedback_failed", {
            feedback,
            track_id: trackId,
            error: err instanceof Error ? err.message : String(err),
          })
          .catch(() => {});
      }
    }
  }
  // Condition A keeps the playlist fixed (applyReplan noops) — skip the round trip.
  if (state.condition === "A") return;
  await replanAndPush(deps, state, {
    mood: state.intent.mood,
    energy_delta: "same",
    scope: "nudge",
    reroll: feedback === "dislike",
  });
}
