import type { OrchestrationDeps } from "./replan.js";
import type { SessionState } from "./store.js";

/** Append a fresh batch once the queue runs this low (slots after current). */
export const EXTEND_THRESHOLD = 2;
/** How many tracks to append per extend. */
export const EXTEND_APPEND_SLOTS = 4;

/**
 * Rolling extend (E1, design §2.1/§4.2): when the not-yet-played queue drops to
 * `EXTEND_THRESHOLD` or fewer, append a fresh batch so the station stays on air
 * instead of falling back to idle after the initial arc. Append-only: the current
 * track and existing remaining are untouched. Deterministic — uses the LLM-free
 * `extend` mode, never a Flow replan.
 *
 * Fire-and-forget from `markNowPlaying`; debounced via `state.extendPending` so a
 * burst of now_playing pings can't trigger overlapping extends. Condition A is a
 * noop (ablation); B and C behave the same. A failure logs and leaves the queue
 * as-is (E6 owns the user-facing end-of-session fallback).
 */
export async function extendQueue(
  deps: OrchestrationDeps,
  state: SessionState,
  log?: { warn(payload: unknown, message?: string): void },
): Promise<void> {
  if (state.condition === "A" || state.extendPending) return;
  const before = deps.store.remaining(state);
  if (before.length > EXTEND_THRESHOLD) return;

  state.extendPending = true;
  try {
    // Exclude everything already in the queue (played + current + remaining).
    const playedIds = state.tracklist.map((r) => r.id);
    const tail = state.tracklist[state.tracklist.length - 1];
    const lastPlayedEnergy = tail ? (state.energyById.get(tail.id) ?? null) : null;

    const personalized = state.condition === "C";
    const taste = personalized ? await deps.memory.tasteWeights(state.userId).catch(() => undefined) : undefined;
    const plan = await deps.music.planTracklist({
      intent: state.intent,
      mode: "extend",
      memories: personalized ? state.mem0Context : "",
      energyWeights: personalized ? state.energyWeights : undefined,
      taste,
      extend: { playedIds, appendSlots: EXTEND_APPEND_SLOTS, lastPlayedEnergy },
    });

    const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
    const appended = deps.store.appendTracks(state, plan.result.tracklist, candidatesById);
    if (appended.length === 0) return; // catalog exhausted — nothing fresh to add

    const after = deps.store.remaining(state);
    await deps.proxy.inject(state.id, {
      ui_events: [
        {
          type: "tracklist_updated",
          remaining: after,
          session_title: state.title,
          session_subtitle: state.subtitle,
        },
      ],
    });
    await deps.memory.recordEvent(state.id, state.userId, "queue_extended", {
      before_count: before.length,
      after_count: after.length,
      appended: appended.map((r) => r.id),
    });
  } catch (err) {
    log?.warn({ err: err instanceof Error ? err.message : String(err), sessionId: state.id }, "rolling extend failed");
  } finally {
    state.extendPending = false;
  }
}
