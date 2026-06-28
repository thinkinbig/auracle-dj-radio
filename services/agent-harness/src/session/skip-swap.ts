import { pushQueueUpdate } from "./queue-update.js";
import type { OrchestrationDeps } from "./replan.js";
import type { SessionState } from "./store.js";

/** How many candidates to pull from the catalog when picking a swap target. */
const SWAP_CANDIDATE_LIMIT = 8;

/**
 * Deterministic next-track swap on a quick skip (E4, design §2.3). When the user
 * skips the current track quickly, swap remaining[0] for a fresh candidate of a
 * different energy — without invoking the Flow LLM (uses `/search_catalog`) and
 * without blocking the skip path. Fire-and-forget: any failure is swallowed so a
 * swap never disrupts skip handling. Condition A is a noop (ablation); B and C
 * behave identically.
 *
 * @param skippedEnergy energy of the track the user just skipped, used to steer
 *   the replacement toward a different energy band (null when unknown).
 */
export async function swapNextOnQuickSkip(
  deps: OrchestrationDeps,
  state: SessionState,
  skippedEnergy: number | null,
): Promise<void> {
  try {
    if (state.condition === "A") return;
    const beforeRemainingIds = deps.store.remaining(state).map((ref) => ref.id);
    const next = beforeRemainingIds[0];
    if (!next) return;

    // Exclude everything already in the queue so the new next is genuinely novel
    // (played + current + all remaining slots).
    const excludeIds = [...new Set(state.tracklist.map((r) => r.id))];
    const { candidates } = await deps.music.searchCatalog({
      mood: state.intent.mood,
      scene: state.intent.scene,
      excludeIds,
      limit: SWAP_CANDIDATE_LIMIT,
      tieBreakSeed: state.tieBreakSeed,
    });

    // Prefer a different energy than the skipped track; fall back to the top candidate.
    const replacement =
      (skippedEnergy != null ? candidates.find((c) => c.energy !== skippedEnergy) : undefined) ?? candidates[0];
    if (!replacement) return;

    const swap = deps.store.swapNext(state, replacement, "swapped after a quick skip");
    if (!swap) return;

    await pushQueueUpdate(deps, state, {
      remaining: deps.store.remaining(state),
      changedIds: [swap.after],
      beforeRemainingIds,
    });

    await deps.memory.recordEvent(state.id, state.userId, "skip_queue_adjusted", {
      before: swap.before,
      after: swap.after,
      skipped_energy: skippedEnergy,
      replacement_energy: replacement.energy,
    });
  } catch {
    // Fire-and-forget: a swap failure must never disrupt the skip path.
  }
}
