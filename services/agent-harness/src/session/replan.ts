import { randomUUID } from "node:crypto";
import type { FlowTrackRef, RegenerateSessionResponse } from "@auracle/shared";
import type { MemoryServiceClient } from "../memory-service-client.js";
import type { MusicEngineClient } from "../music-engine-client.js";
import type { ProxyClient } from "../proxy-client.js";
import { pushQueueUpdate, pushQueueRefresh } from "./queue-update.js";
import type { PlaylistFeedbackSource } from "@auracle/shared";
import type { SessionState, SessionStore } from "./store.js";

/** Dependencies shared by the orchestration handlers (replan + tool dispatch). */
export interface OrchestrationDeps {
  store: SessionStore;
  memory: MemoryServiceClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
}

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

export function changedIdsFromRemaining(beforeIds: string[], afterRefs: FlowTrackRef[]): string[] {
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
  remaining: FlowTrackRef[];
}

export interface RegenerateOutcome extends ReplanOutcome {
  before: string[];
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

  // nudge touches the next 1–2 slots, steer the latter ~half, full the whole
  // remaining queue. The window drives how many tracks we ask the engine for and
  // which remaining slots we overwrite (design §2.2).
  const scope: ReplanScope = params.scope ?? "nudge";
  const { start, count } = scopeWindow(scope, remainingCount);

  // Seed the new chain from the energy of the track just before the replaced window
  // (the current track for nudge/full; the last kept head slot for steer) so the
  // refill glides on smoothly.
  const seedTrack = state.tracklist[state.currentTrackIndex + start];
  const seed = seedTrack ? (state.energyById.get(seedTrack.id) ?? null) : null;
  const lastPlayedEnergy = nudge(seed, params.energy_delta);
  // Exclude played + current AND every remaining slot we keep (head + tail of the
  // window), so fresh picks never duplicate a track that stays in the queue.
  const remainingRefs = deps.store.remaining(state);
  const keptIds = [...remainingRefs.slice(0, start), ...remainingRefs.slice(start + count)].map((r) => r.id);
  const playedIds = [...state.tracklist.slice(0, state.currentTrackIndex + 1).map((r) => r.id), ...keptIds];
  const intent = { ...state.intent, mood: params.mood };
  const before = remainingRefs.map((r) => r.id);
  // On a re-roll, steer away from the occupants of the slots we're replacing and use
  // a fresh seed, so a repeated Regenerate yields different tracks rather than the
  // same deterministic plan (soft exclude — the engine tops up if the band runs dry).
  const replacedWindow = remainingRefs.slice(start, start + count).map((r) => r.id);

  const personalized = state.condition === "C";
  const taste = personalized ? await deps.memory.tasteWeights(state.userId).catch(() => undefined) : undefined;
  const { result, violations, candidates } = await deps.music.planTracklist({
    intent,
    mode: "replan",
    memories: personalized ? state.mem0Context : "",
    energyWeights: personalized ? state.energyWeights : undefined,
    taste,
    replan: { playedIds, played: [], lastPlayedEnergy, remainingSlots: count, avoidIds: params.reroll ? replacedWindow : undefined },
    tieBreakSeed: params.reroll ? randomUUID() : state.tieBreakSeed,
    // Re-rank the cached Spotify pool into the refill — no fresh gather (#77).
    spotifyCandidates: state.spotifyCandidates,
    spotifyEnergyByUri: state.spotifyEnergyByUri,
  });

  const candidatesById = new Map(candidates.map((c) => [c.id, c]));
  const nextRemaining = deps.store.replaceRemaining(state, result.tracklist, candidatesById, { start, count });
  state.intent = intent; // future replans build on the new mood

  await deps.memory.recordEvent(state.id, state.userId, "replan", {
    mood: params.mood,
    energy_delta: params.energy_delta ?? "same",
    scope,
    before,
    after: nextRemaining.map((r) => r.id),
    violations,
  });

  // A successful mood shift is a cross-session preference signal — Condition C only.
  if (personalized) {
    void deps.memory
      .remember(
        `During a ${state.intent.scene} session the user shifted the mood to "${params.mood}" (${params.energy_delta ?? "same"} energy).`,
        state.id,
        state.userId,
      )
      .catch(() => {});
  }

  return { replanned: true, remaining: nextRemaining };
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
    await deps.memory.recordEvent(state.id, state.userId, "replan_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    await pushQueueRefresh(deps, state.id, "error");
  }
}

/** Shift the glide seed by the requested energy delta, clamped to 1–5. */
export function nudge(energy: number | null, delta: ReplanParams["energy_delta"]): number | null {
  if (energy === null) return null;
  if (delta === "heavier") return Math.min(5, energy + 1);
  if (delta === "lighter") return Math.max(1, energy - 1);
  return energy;
}
