import type { TrackCandidate } from "@auracle/shared";
import { pushQueueUpdate } from "../delivery/queue-update.js";
import type { OrchestrationDeps } from "../deps.js";
import type { SessionState } from "../state.js";

/** How many candidates to pull from the catalog when picking a swap target. */
const SWAP_CANDIDATE_LIMIT = 8;

interface QuickSkipSwapContext {
  beforeRemainingIds: string[];
  excludeIds: string[];
  skippedEnergy: number | null;
}

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
    const context = buildQuickSkipSwapContext(deps, state, skippedEnergy);
    if (!context) return;

    const candidates = await searchQuickSkipReplacements(deps, state, context);
    const replacement = selectQuickSkipReplacement(candidates, skippedEnergy);
    if (!replacement) return;

    const swap = applyQuickSkipSwap(deps, state, replacement);
    if (!swap) return;

    await pushQuickSkipSwap(deps, state, context, swap.after);
    await recordQuickSkipSwap(deps, state, context, swap.before, swap.after, replacement);
  } catch {
    // Fire-and-forget: a swap failure must never disrupt the skip path.
  }
}

function buildQuickSkipSwapContext(
  deps: OrchestrationDeps,
  state: SessionState,
  skippedEnergy: number | null,
): QuickSkipSwapContext | null {
  const beforeRemainingIds = deps.store.remaining(state).map((ref) => ref.id);
  const nextId = beforeRemainingIds[0];
  if (!nextId) return null;

  return {
    beforeRemainingIds,
    // Exclude everything already in the queue so the new next is genuinely novel
    // (played + current + all remaining slots).
    excludeIds: [...new Set(state.tracklist.map((r) => r.id))],
    skippedEnergy,
  };
}

async function searchQuickSkipReplacements(
  deps: OrchestrationDeps,
  state: SessionState,
  context: QuickSkipSwapContext,
): Promise<TrackCandidate[]> {
  const { candidates } = await deps.music.searchCatalog({
    mood: state.intent.mood,
    scene: state.intent.scene,
    excludeIds: context.excludeIds,
    limit: SWAP_CANDIDATE_LIMIT,
    tieBreakSeed: state.tieBreakSeed,
  });
  return candidates;
}

function selectQuickSkipReplacement(candidates: TrackCandidate[], skippedEnergy: number | null): TrackCandidate | undefined {
  // Prefer a different energy than the skipped track; fall back to the top candidate.
  return (skippedEnergy != null ? candidates.find((c) => c.energy !== skippedEnergy) : undefined) ?? candidates[0];
}

function applyQuickSkipSwap(deps: OrchestrationDeps, state: SessionState, replacement: TrackCandidate) {
  return deps.store.swapNext(state, replacement, "swapped after a quick skip");
}

async function pushQuickSkipSwap(
  deps: OrchestrationDeps,
  state: SessionState,
  context: QuickSkipSwapContext,
  changedId: string,
): Promise<void> {
  await pushQueueUpdate(deps, state, {
    remaining: deps.store.remaining(state),
    changedIds: [changedId],
    beforeRemainingIds: context.beforeRemainingIds,
  });
}

async function recordQuickSkipSwap(
  deps: OrchestrationDeps,
  state: SessionState,
  context: QuickSkipSwapContext,
  before: string,
  after: string,
  replacement: TrackCandidate,
): Promise<void> {
  await deps.profile.recordEvent(state.id, state.userId, "skip_queue_adjusted", {
    before,
    after,
    skipped_energy: context.skippedEnergy,
    replacement_energy: replacement.energy,
  });
}
