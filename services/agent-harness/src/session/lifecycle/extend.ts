import type { PlannedTrack, TastePreference } from "@auracle/shared";
import type { PlanResponse } from "@auracle/clients";
import { pushQueueRefresh, pushQueueUpdate } from "../delivery/queue-update.js";
import type { OrchestrationDeps } from "../deps.js";
import { changedIdsFromRemaining } from "../planning/replan.js";
import type { SessionState } from "../state.js";

/** Append a fresh batch once the queue runs this low (slots after current). */
export const EXTEND_THRESHOLD = 2;
/** How many tracks to append per extend. */
export const EXTEND_APPEND_SLOTS = 4;

interface ExtendContext {
  before: PlannedTrack[];
  beforeRemainingIds: string[];
  playedIds: string[];
  lastPlayedEnergy: number | null;
  personalized: boolean;
  taste?: TastePreference[];
}

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
  opts?: { force?: boolean },
): Promise<void> {
  if (state.condition === "A" || state.extendPending) return;
  if (!shouldExtend(deps, state, opts)) return;

  state.extendPending = true;
  // Best-effort: extendQueue is void'ed from now_playing, so a proxy hiccup here
  // must not escape as an unhandled rejection (the extend itself still runs).
  await pushQueueRefresh(deps, state.id, "pending").catch(() => {});
  try {
    const context = await buildExtendContext(deps, state);
    const plan = await requestExtendPlan(deps, state, context);
    const appended = applyExtendPlan(deps, state, plan);
    if (appended.length === 0) {
      await pushQueueRefresh(deps, state.id, "error");
      return;
    }

    await pushExtendUpdate(deps, state, context);
    await recordQueueExtended(deps, state, context, appended);
  } catch (err) {
    log?.warn({ err: err instanceof Error ? err.message : String(err), sessionId: state.id }, "rolling extend failed");
    await pushQueueRefresh(deps, state.id, "error").catch(() => {});
  } finally {
    state.extendPending = false;
  }
}

function shouldExtend(deps: OrchestrationDeps, state: SessionState, opts?: { force?: boolean }): boolean {
  return Boolean(opts?.force) || deps.store.remaining(state).length <= EXTEND_THRESHOLD;
}

async function buildExtendContext(deps: OrchestrationDeps, state: SessionState): Promise<ExtendContext> {
  const before = deps.store.remaining(state);
  const personalized = state.condition === "C";
  return {
    before,
    beforeRemainingIds: before.map((ref) => ref.id),
    // Exclude everything already in the queue (played + current + remaining).
    playedIds: state.tracklist.map((r) => r.id),
    lastPlayedEnergy: tailEnergy(state),
    personalized,
    taste: state.sessionTaste.length > 0 ? state.sessionTaste : undefined,
  };
}

function tailEnergy(state: SessionState): number | null {
  const tail = state.tracklist[state.tracklist.length - 1];
  return tail ? (state.energyById.get(tail.id) ?? null) : null;
}

async function requestExtendPlan(
  deps: OrchestrationDeps,
  state: SessionState,
  context: ExtendContext,
): Promise<PlanResponse> {
  return deps.music.planTracklist({
    intent: state.intent,
    mode: "extend",
    memories: context.personalized ? state.personalizationContext : "",
    taste: context.taste,
    extend: {
      playedIds: context.playedIds,
      appendSlots: EXTEND_APPEND_SLOTS,
      lastPlayedEnergy: context.lastPlayedEnergy,
    },
    tieBreakSeed: state.tieBreakSeed,
    // Append from the same cached seed pool — no fresh gather (#77).
    seeds: state.seeds,
  });
}

function applyExtendPlan(deps: OrchestrationDeps, state: SessionState, plan: PlanResponse): PlannedTrack[] {
  const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
  return deps.store.appendTracks(state, plan.result.tracklist, candidatesById);
}

async function pushExtendUpdate(deps: OrchestrationDeps, state: SessionState, context: ExtendContext): Promise<void> {
  const after = deps.store.remaining(state);
  await pushQueueUpdate(deps, state, {
    remaining: after,
    changedIds: changedIdsFromRemaining(context.beforeRemainingIds, after),
    beforeRemainingIds: context.beforeRemainingIds,
  });
}

async function recordQueueExtended(
  deps: OrchestrationDeps,
  state: SessionState,
  context: ExtendContext,
  appended: PlannedTrack[],
): Promise<void> {
  await deps.memory.recordEvent(state.id, state.userId, "queue_extended", {
    before_count: context.before.length,
    after_count: deps.store.remaining(state).length,
    appended: appended.map((r) => r.id),
  });
}
