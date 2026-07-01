import { randomUUID } from "node:crypto";
import type { PlannedTrack, RegenerateSessionResponse, SessionIntent, TastePreference } from "@auracle/shared";
import type { PlanResponse } from "@auracle/clients";
import { pushQueueUpdate, pushQueueRefresh } from "../delivery/queue-update.js";
import type { PlaylistFeedbackSource } from "@auracle/shared";
import type { OrchestrationDeps } from "../deps.js";
import type { SessionState } from "../state.js";
import { overlaySessionTaste } from "./session-taste.js";

/**
 * On-air adjustment tier (design §2.2):
 * - `nudge` — default for `mood_change`: re-fill only the next 1–2 slots, keep the tail.
 * - `steer` — significant mood-text change (E5): re-fill the latter ~half, keep the head.
 * - `full`  — UI Regenerate / explicit "new batch": replace the whole remaining queue.
 * `mood_change` routes nudge vs steer in the tool-runner (see `routeMoodScope`);
 * `full` is reserved for the explicit Regenerate path.
 */
export type ReplanScope = "nudge" | "steer" | "full";

export interface ReplanParams {
  mood: string;
  energy_delta?: "lighter" | "heavier" | "same";
  /** Adjustment tier; defaults to `nudge` (the mid-session default per design §2.2). */
  scope?: ReplanScope;
  /**
   * Re-roll (the Regenerate button): use a fresh tie-break seed and steer away from
   * the slots being replaced, so repeated regenerates surface different tracks
   * instead of recomputing the session's one deterministic plan. Off for the DJ's
   * `mood_change`, which should stay stable for a given mood.
   */
  reroll?: boolean;
}

/** nudge re-fills at most this many of the next not-yet-played slots (design §2.2). */
const NUDGE_SLOTS = 2;

/** Which remaining slots a scope rewrites (design §2.2): nudge=front 1–2, steer=latter ~half, full=all. */
function scopeWindow(scope: ReplanScope, remainingCount: number): { start: number; count: number } {
  if (scope === "nudge") return { start: 0, count: Math.min(NUDGE_SLOTS, remainingCount) };
  if (scope === "steer") {
    const count = Math.ceil(remainingCount / 2);
    return { start: remainingCount - count, count };
  }
  return { start: 0, count: remainingCount }; // full
}

export function changedIdsFromRemaining(beforeIds: string[], afterRefs: PlannedTrack[]): string[] {
  const changed = new Set<string>();
  const afterIds = afterRefs.map((ref) => ref.id);
  const max = Math.max(beforeIds.length, afterIds.length);
  for (let i = 0; i < max; i += 1) {
    const afterId = afterIds[i];
    if (afterId && beforeIds[i] !== afterId) changed.add(afterId);
  }
  return [...changed];
}

export interface ReplanOutcome {
  replanned: boolean;
  remaining: PlannedTrack[];
}

export interface RegenerateOutcome extends ReplanOutcome {
  before: string[];
}

interface ReplanWindow {
  scope: ReplanScope;
  start: number;
  count: number;
}

interface ReplanContext extends ReplanWindow {
  intent: SessionIntent;
  /** Mood before this replan, to tell a real mood shift from a same-mood re-rank. */
  previousMood: string;
  before: string[];
  playedIds: string[];
  lastPlayedEnergy: number | null;
  replacedWindow: string[];
  personalized: boolean;
  taste?: TastePreference[];
}

/**
 * Re-plan not-yet-played slots for a new mood (the Live `mood_change` tool calls
 * this). The current track keeps playing. Defaults to a `nudge` — only the next
 * 1–2 slots change, the rest of the queue is untouched — so a between-track mood
 * tweak is felt without churning the whole list (design §2.2); Regenerate passes
 * `scope: "full"` to replace all remaining. Condition A leaves the playlist fixed
 * (noop), as does an empty remaining queue. Sources the new arc from music-engine
 * over HTTP (refactor-three-services).
 */
export async function applyReplan(
  deps: OrchestrationDeps,
  state: SessionState,
  params: ReplanParams,
): Promise<ReplanOutcome> {
  const remainingCount = state.tracklist.length - (state.currentTrackIndex + 1);
  if (state.condition === "A" || remainingCount <= 0) {
    return { replanned: false, remaining: deps.store.remaining(state) };
  }

  const context = await buildReplanContext(deps, state, params, remainingCount);
  const plan = await requestReplan(deps, state, params, context);
  const nextRemaining = applyReplanResult(deps, state, context, plan);

  await recordReplan(deps, state, params, context, plan, nextRemaining);
  rememberPersonalizedMoodShift(deps, state, params, context);

  return { replanned: true, remaining: nextRemaining };
}

async function buildReplanContext(
  deps: OrchestrationDeps,
  state: SessionState,
  params: ReplanParams,
  remainingCount: number,
): Promise<ReplanContext> {
  const window = selectReplanWindow(params, remainingCount);
  const remainingRefs = deps.store.remaining(state);
  const before = remainingRefs.map((r) => r.id);
  const playedIds = playedAndKeptIds(state, remainingRefs, window);
  const personalized = state.condition === "C";

  return {
    ...window,
    intent: { ...state.intent, mood: params.mood },
    previousMood: state.intent.mood,
    before,
    playedIds,
    lastPlayedEnergy: windowSeedEnergy(state, params, window),
    replacedWindow: remainingRefs.slice(window.start, window.start + window.count).map((r) => r.id),
    personalized,
    // Stored prefs are condition-C-only, but this session's own like/dislike
    // signal (#68) overlays in B and C alike — a session-scoped reaction is
    // not cross-session personalization.
    taste: overlaySessionTaste(
      personalized ? await deps.memory.tasteWeights(state.userId).catch(() => undefined) : undefined,
      state.sessionTaste,
    ),
  };
}

function selectReplanWindow(params: ReplanParams, remainingCount: number): ReplanWindow {
  // The window drives how many tracks we ask the engine for and which remaining
  // slots we overwrite: nudge=front 1-2, steer=latter half, full=all.
  const scope: ReplanScope = params.scope ?? "nudge";
  const { start, count } = scopeWindow(scope, remainingCount);
  return { scope, start, count };
}

function windowSeedEnergy(state: SessionState, params: ReplanParams, window: ReplanWindow): number | null {
  // Seed from the track just before the replaced window (current for nudge/full,
  // last kept head slot for steer), so the refill glides on smoothly.
  const seedTrack = state.tracklist[state.currentTrackIndex + window.start];
  const seed = seedTrack ? (state.energyById.get(seedTrack.id) ?? null) : null;
  return nudge(seed, params.energy_delta);
}

function playedAndKeptIds(state: SessionState, remainingRefs: PlannedTrack[], window: ReplanWindow): string[] {
  // Exclude played + current AND every remaining slot we keep, so fresh picks
  // never duplicate a track that stays in the queue.
  const keptIds = [...remainingRefs.slice(0, window.start), ...remainingRefs.slice(window.start + window.count)].map((r) => r.id);
  return [...state.tracklist.slice(0, state.currentTrackIndex + 1).map((r) => r.id), ...keptIds];
}

function requestReplan(
  deps: OrchestrationDeps,
  state: SessionState,
  params: ReplanParams,
  context: ReplanContext,
): Promise<PlanResponse> {
  return deps.music.planTracklist({
    intent: context.intent,
    mode: "replan",
    memories: context.personalized ? state.mem0Context : "",
    energyWeights: context.personalized ? state.energyWeights : undefined,
    taste: context.taste,
    replan: {
      playedIds: context.playedIds,
      played: [],
      lastPlayedEnergy: context.lastPlayedEnergy,
      remainingSlots: context.count,
      // On a re-roll, steer away from the occupants of the slots being replaced
      // and use a fresh seed so repeated Regenerate yields different tracks.
      avoidIds: params.reroll ? context.replacedWindow : undefined,
    },
    tieBreakSeed: params.reroll ? randomUUID() : state.tieBreakSeed,
    // Re-rank the cached seed pool into the refill — no fresh gather (#77).
    // music-engine reuses its memoized per-uri energy/voicing resolution.
    seeds: state.seeds,
  });
}

function applyReplanResult(deps: OrchestrationDeps, state: SessionState, context: ReplanContext, plan: PlanResponse): PlannedTrack[] {
  const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
  const nextRemaining = deps.store.replaceRemaining(state, plan.result.tracklist, candidatesById, {
    start: context.start,
    count: context.count,
  });
  state.intent = context.intent; // future replans build on the new mood
  return nextRemaining;
}

async function recordReplan(
  deps: OrchestrationDeps,
  state: SessionState,
  params: ReplanParams,
  context: ReplanContext,
  plan: PlanResponse,
  nextRemaining: PlannedTrack[],
): Promise<void> {
  await deps.memory.recordEvent(state.id, state.userId, "replan", {
    mood: params.mood,
    energy_delta: params.energy_delta ?? "same",
    scope: context.scope,
    before: context.before,
    after: nextRemaining.map((r) => r.id),
    violations: plan.violations,
  });
}

function rememberPersonalizedMoodShift(
  deps: OrchestrationDeps,
  state: SessionState,
  params: ReplanParams,
  context: ReplanContext,
): void {
  // A successful mood shift is a cross-session preference signal — Condition C only.
  if (!context.personalized) return;
  // A same-mood, same-energy re-rank (feedback nudge, regenerate re-roll) is not a
  // mood shift — writing one would spam mem0 with "shifted to <current mood>" facts.
  if (params.mood === context.previousMood && (params.energy_delta ?? "same") === "same") return;
  void deps.memory
    .remember(
      `During a ${state.intent.scene} session the user shifted the mood to "${params.mood}" (${params.energy_delta ?? "same"} energy).`,
      state.id,
      state.userId,
    )
    .catch(() => {});
}

/** Full remaining-queue replan shared by UI regenerate and DJ tool push. */
export async function regenerateRemaining(deps: OrchestrationDeps, state: SessionState): Promise<RegenerateOutcome> {
  const before = deps.store.remaining(state).map((track) => track.id);
  const outcome = await applyReplan(deps, state, {
    mood: state.intent.mood,
    energy_delta: "same",
    scope: "full",
    reroll: true,
  });
  return { replanned: outcome.replanned, remaining: outcome.remaining, before };
}

export function toRegenerateSessionResponse(state: SessionState, outcome: RegenerateOutcome): RegenerateSessionResponse {
  return {
    ok: true,
    replanned: outcome.replanned,
    session_title: state.title,
    session_subtitle: state.subtitle,
    current_track_index: state.currentTrackIndex,
    tracklist: state.tracklist,
    remaining: outcome.remaining,
    changed_ids: changedIdsFromRemaining(outcome.before, outcome.remaining),
    before_remaining_ids: outcome.before,
  };
}

/**
 * Background mood replan (Lane 3): run the slow Flow-LLM replan and, if the
 * tracklist changed, push `tracklist_updated` to the live session via the proxy.
 * Fire-and-forget from `mood_change` — the DJ already acked, so the conversation
 * never waits on this (see perf-first-start). A failure (replan or push) records
 * a `replan_failed` event rather than surfacing to the already-returned tool call.
 */
export async function replanAndPush(
  deps: OrchestrationDeps,
  state: SessionState,
  params: ReplanParams,
): Promise<void> {
  try {
    const beforeRemainingIds = deps.store.remaining(state).map((ref) => ref.id);
    const outcome = await applyReplan(deps, state, params);
    if (!outcome.replanned) return;
    await pushQueueUpdate(deps, state, {
      remaining: outcome.remaining,
      changedIds: changedIdsFromRemaining(beforeRemainingIds, outcome.remaining),
      beforeRemainingIds,
    });
  } catch (err) {
    await deps.memory.recordEvent(state.id, state.userId, "replan_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Background full-queue regenerate (Lane 3): DJ tool delivery over the proxy.
 * `playlist_feedback` event is recorded by {@link runPlaylistFeedback} first.
 */
export async function regenerateAndPush(
  deps: OrchestrationDeps,
  state: SessionState,
  source: PlaylistFeedbackSource,
): Promise<void> {
  try {
    const outcome = await regenerateRemaining(deps, state);
    if (!outcome.replanned) {
      await pushQueueRefresh(deps, state.id, "error");
      return;
    }
    await deps.memory.recordEvent(state.id, state.userId, "playlist_regenerate_requested", {
      current_track_id: state.tracklist[state.currentTrackIndex]?.id ?? null,
      before: outcome.before,
      after: outcome.remaining.map((track) => track.id),
      replanned: outcome.replanned,
      source,
    });
    await pushQueueUpdate(deps, state, {
      remaining: outcome.remaining,
      changedIds: changedIdsFromRemaining(outcome.before, outcome.remaining),
      beforeRemainingIds: outcome.before,
    });
  } catch (err) {
    // Both cleanup calls are best-effort: this runs void'ed (fire-and-forget), so a
    // failure here (e.g. proxy down) must not escape as an unhandled rejection.
    await deps.memory
      .recordEvent(state.id, state.userId, "replan_failed", {
        error: err instanceof Error ? err.message : String(err),
      })
      .catch(() => {});
    await pushQueueRefresh(deps, state.id, "error").catch(() => {});
  }
}

/** Shift the glide seed by the requested energy delta, clamped to 1–5. */
export function nudge(energy: number | null, delta: ReplanParams["energy_delta"]): number | null {
  if (energy === null) return null;
  if (delta === "heavier") return Math.min(5, energy + 1);
  if (delta === "lighter") return Math.max(1, energy - 1);
  return energy;
}
