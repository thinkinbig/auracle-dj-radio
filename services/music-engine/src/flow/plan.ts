import type { Energy, FlowResult, FlowTrackRef, SessionIntent, SpotifyTrackRef, SpotifyVoicing, TastePreference, TrackCandidate } from "@auracle/shared";
import { FULL_SESSION_LENGTH, energyTargetsForMood } from "@auracle/shared";
import type { TrackRow } from "../catalog-db.js";
import { HeuristicFlowModel } from "./llm/heuristic-flow.js";
import type { FlowInput } from "./llm/flow-model.js";
import { energyWeightsFromMemories, mergeEnergyWeights } from "./weighting/memory-energy.js";
import { retrieveCandidates } from "./retrieval/retrieve.js";
import { tasteCacheKey } from "./weighting/taste-weighting.js";
import { validateTracklist, type Violation } from "./validation/validate.js";
import { chooseNext } from "./selection/choose-next.js";

export interface PlanDeps {
  /** Returns the full track library (read from SQLite at call time). */
  tracks: () => TrackRow[];
}

/**
 * Fallback energy for a Spotify candidate (ADR-0005 §4): Spotify's audio-features
 * endpoint is deprecated, so energy is supplied externally — either reused exactly
 * from a matching catalog track or LLM-inferred by agent-harness (#74). When neither
 * is available yet (the fast provisional path), the track sits mid-arc so `chooseNext`
 * can still rank it against local tracks on this one axis.
 */
const SPOTIFY_PLACEHOLDER_ENERGY: Energy = 3;

/** Normalize a title/artist for tolerant equality (case, punctuation, spacing). */
function normalizeMatchKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Exact catalog reuse (ADR-0005 §4–5): when a gathered Spotify track is the same
 * recording as one in our catalog (normalized title+artist), reuse its authored
 * energy and DJ voicing rather than inferring them. Returns uri→energy and
 * uri→voicing maps of the hits.
 */
function matchCatalog(
  tracks: TrackRow[],
  refs: SpotifyTrackRef[],
): { energy: Record<string, Energy>; voicing: Record<string, SpotifyVoicing> } {
  const byTitleArtist = new Map<string, TrackRow>();
  for (const t of tracks) {
    byTitleArtist.set(`${normalizeMatchKey(t.title)} | ${normalizeMatchKey(t.artist)}`, t);
  }
  const energy: Record<string, Energy> = {};
  const voicing: Record<string, SpotifyVoicing> = {};
  for (const r of refs) {
    const t = byTitleArtist.get(`${normalizeMatchKey(r.title)} | ${normalizeMatchKey(r.artist)}`);
    if (!t) continue;
    energy[r.uri] = t.energy;
    voicing[r.uri] = { artistPersona: t.artistPersona ?? "", albumConcept: t.albumConcept ?? "", lore: t.lore ?? "" };
  }
  return { energy, voicing };
}

/**
 * Turn the client-gathered Spotify refs into rankable candidates + a uri→ref lookup
 * for stamping. Energy precedence: externally supplied (`energyByUri`, the merged
 * catalog-match + LLM map from agent-harness) → exact catalog match → placeholder.
 */
function spotifyCandidatePool(
  refs: SpotifyTrackRef[] | undefined,
  scene: string,
  tracks: TrackRow[],
  energyByUri?: Record<string, Energy>,
): {
  pool: TrackCandidate[];
  byUri: Map<string, SpotifyTrackRef>;
  matchedEnergy: Record<string, Energy>;
  matchedVoicing: Record<string, SpotifyVoicing>;
} {
  const list = refs ?? [];
  const { energy: matchedEnergy, voicing: matchedVoicing } = list.length
    ? matchCatalog(tracks, list)
    : { energy: {}, voicing: {} };
  const byUri = new Map<string, SpotifyTrackRef>();
  const pool: TrackCandidate[] = [];
  for (const r of list) {
    if (byUri.has(r.uri)) continue;
    byUri.set(r.uri, r);
    const energy = energyByUri?.[r.uri] ?? matchedEnergy[r.uri] ?? SPOTIFY_PLACEHOLDER_ENERGY;
    // uri is the slot id; the client plays it directly (no catalog entry to resolve).
    pool.push({ id: r.uri, energy, tempo: 0, genre: "", scene });
  }
  return { pool, byUri, matchedEnergy, matchedVoicing };
}

/** Stamp `source:"spotify"` + inline metadata onto slots the planner picked from the Spotify pool. */
function stampSpotify(tracklist: FlowTrackRef[], byUri: Map<string, SpotifyTrackRef>): FlowTrackRef[] {
  if (byUri.size === 0) return tracklist;
  return tracklist.map((ref) => {
    const s = byUri.get(ref.id);
    return s ? { ...ref, source: "spotify" as const, spotify: s } : ref;
  });
}

export interface PlanResult {
  result: FlowResult;
  violations: Violation[];
  candidatesById: Map<string, TrackCandidate>;
  /** uri→energy for Spotify candidates that matched a catalog track (ADR-0005 §4); lets agent-harness LLM-infer only the remainder. */
  spotifyMatchedEnergy?: Record<string, Energy>;
  /** uri→voicing for Spotify candidates that matched a catalog track (ADR-0005 §5); reused verbatim so the DJ voices them like local tracks. */
  spotifyMatchedVoicing?: Record<string, SpotifyVoicing>;
}

/**
 * Cache of clean initial plans keyed on the inputs that determine them.
 * Condition isn't part of the key — it only changes `memories` (C passes mem0
 * recall, A/B pass ""), so the memories string already captures it. Including
 * memories means a new recorded preference (which changes recall) busts the
 * cache, preserving Condition C fidelity.
 */
const PLAN_CACHE_MAX = 256;
const planCache = new Map<string, PlanResult>();

/** Read with LRU recency bump so hot intents survive eviction. */
function cacheGet(key: string): PlanResult | undefined {
  const hit = planCache.get(key);
  if (hit) {
    planCache.delete(key);
    planCache.set(key, hit);
  }
  return hit;
}

/** Insert and evict the least-recently-used entry past the cap (per-user memories/taste keys are unbounded otherwise). */
function cacheSet(key: string, value: PlanResult): void {
  planCache.set(key, value);
  if (planCache.size > PLAN_CACHE_MAX) {
    const oldest = planCache.keys().next().value;
    if (oldest !== undefined) planCache.delete(oldest);
  }
}

function planKey(
  intent: SessionIntent,
  memories: string,
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
  tieBreakSeed?: string,
): string {
  const w = energyWeights && Object.keys(energyWeights).length > 0
    ? Object.entries(energyWeights).sort(([a], [b]) => Number(a) - Number(b)).map(([k, v]) => `${k}:${(v ?? 0).toFixed(2)}`).join(",")
    : "";
  return [intent.mood, intent.scene, intent.duration_min, memories, w, tasteCacheKey(taste), tieBreakSeed ?? ""].join(" ");
}

/** Defensive copy so a cached plan can't be mutated by replan/store aliasing. */
function clonePlan(p: PlanResult): PlanResult {
  return {
    result: { ...p.result, tracklist: p.result.tracklist.map((t) => ({ ...t })) },
    violations: [...p.violations],
    candidatesById: new Map(p.candidatesById),
    spotifyMatchedEnergy: p.spotifyMatchedEnergy,
    spotifyMatchedVoicing: p.spotifyMatchedVoicing,
  };
}

/** createPlan with an in-process cache so repeat sessions with identical inputs are instant. */
export async function createPlanCached(
  deps: PlanDeps,
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
  tieBreakSeed?: string,
  spotifyCandidates?: SpotifyTrackRef[],
  spotifyEnergyByUri?: Record<string, Energy>,
): Promise<PlanResult> {
  // A mixed pool is per-user (the listener's own Spotify library), so it must not
  // be served from — or written to — the shared local-only plan cache.
  if (spotifyCandidates?.length) {
    return createPlan(deps, intent, memories, energyWeights, taste, tieBreakSeed, spotifyCandidates, spotifyEnergyByUri);
  }
  const key = planKey(intent, memories, energyWeights, taste, tieBreakSeed);
  const hit = cacheGet(key);
  if (hit) return clonePlan(hit);

  const plan = await createPlan(deps, intent, memories, energyWeights, taste, tieBreakSeed);
  if (plan.violations.length === 0) cacheSet(key, plan); // don't cache imperfect plans
  return clonePlan(plan);
}

/** Cached plan for these inputs without computing one — lets the route skip the provisional path on a hit. */
export function peekPlanCache(
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
): PlanResult | undefined {
  const hit = planCache.get(planKey(intent, memories, energyWeights, taste));
  return hit ? clonePlan(hit) : undefined;
}

/**
 * Fast, LLM-free starter plan: retrieval + a deterministic energy-arc ordering.
 * Lets playback begin immediately while the real Flow refines tracks 2..N in the
 * background. Also the graceful fallback if that refine fails.
 */
export async function createProvisionalPlan(
  deps: PlanDeps,
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
  tieBreakSeed?: string,
  spotifyCandidates?: SpotifyTrackRef[],
  spotifyEnergyByUri?: Record<string, Energy>,
): Promise<{ result: FlowResult; candidatesById: Map<string, TrackCandidate>; spotifyMatchedEnergy?: Record<string, Energy>; spotifyMatchedVoicing?: Record<string, SpotifyVoicing> }> {
  const effectiveEnergyWeights = mergeEnergyWeights(energyWeights, energyWeightsFromMemories(memories));
  const tracks = deps.tracks();
  const { pool: spotifyPool, byUri, matchedEnergy, matchedVoicing } = spotifyCandidatePool(spotifyCandidates, intent.scene, tracks, spotifyEnergyByUri);
  const candidates = [
    ...retrieveCandidates(tracks, {
      mood: intent.mood,
      scene: intent.scene,
      limit: 24,
      slots: FULL_SESSION_LENGTH,
      energyWeights: effectiveEnergyWeights,
      taste,
      tieBreakSeed,
    }),
    ...spotifyPool,
  ];
  const candidatesById = new Map(candidates.map((c) => [c.id, c]));
  return {
    result: {
      session_title: provisionalTitle(intent),
      session_subtitle: `${intent.duration_min} min`,
      arc: "warm_up",
      tracklist: stampSpotify(buildProvisionalArc(candidates, intent.mood), byUri),
    },
    candidatesById,
    spotifyMatchedEnergy: matchedEnergy,
    spotifyMatchedVoicing: matchedVoicing,
  };
}

/** Fill starter slots by closest candidate energy to the mood-dependent arc targets. */
function buildProvisionalArc(candidates: TrackCandidate[], mood: string): FlowTrackRef[] {
  const pool = [...candidates];
  const slots: FlowTrackRef[] = [];
  const targets = energyTargetsForMood(FULL_SESSION_LENGTH, mood, null);
  let prev: TrackCandidate | undefined;

  targets.forEach((target, i) => {
    const pick = chooseNext(pool, target, prev);
    if (!pick) return;
    pool.splice(pool.indexOf(pick), 1);
    slots.push({ id: pick.id, flow_position: i + 1, reason: "mood arc target " + target.toFixed(1) + " (provisional)", source: "local" });
    prev = pick;
  });

  return slots;
}

function provisionalTitle(intent: SessionIntent): string {
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  return `${cap(intent.mood)} · ${cap(intent.scene)}`;
}

/** Initial session plan: Step 1 retrieval → Step 2 Flow over a fresh 8-track arc. */
export async function createPlan(
  deps: PlanDeps,
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
  tieBreakSeed?: string,
  spotifyCandidates?: SpotifyTrackRef[],
  spotifyEnergyByUri?: Record<string, Energy>,
): Promise<PlanResult> {
  const effectiveEnergyWeights = mergeEnergyWeights(energyWeights, energyWeightsFromMemories(memories));
  const tracks = deps.tracks();
  const { pool: spotifyPool, byUri, matchedEnergy, matchedVoicing } = spotifyCandidatePool(spotifyCandidates, intent.scene, tracks, spotifyEnergyByUri);
  const candidates = [
    ...retrieveCandidates(tracks, {
      mood: intent.mood,
      scene: intent.scene,
      limit: 24,
      slots: FULL_SESSION_LENGTH,
      energyWeights: effectiveEnergyWeights,
      taste,
      tieBreakSeed,
    }),
    ...spotifyPool,
  ];
  const plan = await runHeuristicFlow({
    intent,
    memories,
    played: [],
    lastPlayedEnergy: null,
    remainingSlots: FULL_SESSION_LENGTH,
    candidates,
  });
  return { ...plan, result: { ...plan.result, tracklist: stampSpotify(plan.result.tracklist, byUri) }, spotifyMatchedEnergy: matchedEnergy, spotifyMatchedVoicing: matchedVoicing };
}

export interface ReplanInput {
  intent: SessionIntent;
  playedIds: string[];
  played: TrackCandidate[];
  lastPlayedEnergy: number | null;
  remainingSlots: number;
  energyWeights?: Partial<Record<number, number>>;
  /** Cross-session preference recall (condition C); "" for A/B. */
  memories?: string;
  /** Structured taste prefer/avoid (condition C); undefined for A/B. */
  taste?: TastePreference[];
  tieBreakSeed?: string;
  /**
   * Currently-shown remaining ids to steer *away* from (the Regenerate re-roll), so
   * a repeated regenerate surfaces different tracks. Soft exclude: if the energy
   * band can't fill the slots without them, the queue is topped up from this pool
   * (genuinely-fresh picks first) rather than coming back short.
   */
  avoidIds?: string[];
  /** Cached Spotify library pool (ADR-0005 §10); re-ranked into the refill, no fresh gather (#77). */
  spotifyCandidates?: SpotifyTrackRef[];
  /** uri→energy for the cached pool (catalog-match + LLM-inferred); resolved once per session (#74). */
  spotifyEnergyByUri?: Record<string, Energy>;
}

/** Mid-session replan: re-fill only the remaining slots, excluding played tracks. */
export async function replan(deps: PlanDeps, input: ReplanInput): Promise<PlanResult> {
  const effectiveEnergyWeights = mergeEnergyWeights(input.energyWeights, energyWeightsFromMemories(input.memories ?? ""));
  const tracks = deps.tracks();
  const retrieve = (excludeIds: Set<string>): TrackCandidate[] =>
    retrieveCandidates(tracks, {
      mood: input.intent.mood,
      scene: input.intent.scene,
      excludeIds,
      limit: Math.max(24, input.remainingSlots * 3),
      slots: input.remainingSlots,
      lastPlayedEnergy: input.lastPlayedEnergy,
      energyWeights: effectiveEnergyWeights,
      taste: input.taste,
      tieBreakSeed: input.tieBreakSeed,
    });

  const hardExclude = new Set(input.playedIds);
  const avoid = (input.avoidIds ?? []).filter((id) => !hardExclude.has(id));
  // No soft-avoid (the default mid-session replan): exclude only played tracks.
  let candidates = retrieve(avoid.length > 0 ? new Set([...hardExclude, ...avoid]) : hardExclude);
  // Re-roll top-up: steering away from the shown tracks can leave too few in the
  // energy band; refill from the avoided pool (fresh picks already first) so the
  // queue stays full instead of shrinking once the band is exhausted.
  if (avoid.length > 0 && candidates.length < input.remainingSlots) {
    const seen = new Set(candidates.map((c) => c.id));
    candidates = [...candidates, ...retrieve(hardExclude).filter((c) => !seen.has(c.id))];
  }
  // Re-rank the cached Spotify pool into the same refill (#77): the library is
  // static per session, so no fresh gather. Exclude played/kept slots — and, on a
  // re-roll, the slots being replaced — so picks never duplicate or repeat.
  const { pool: spotifyPool, byUri } = spotifyCandidatePool(input.spotifyCandidates, input.intent.scene, tracks, input.spotifyEnergyByUri);
  const spotifyExclude = new Set([...input.playedIds, ...(input.avoidIds ?? [])]);
  const mixed = [...candidates, ...spotifyPool.filter((c) => !spotifyExclude.has(c.id))];
  const plan = await runHeuristicFlow({
    intent: input.intent,
    memories: input.memories ?? "",
    played: input.played,
    lastPlayedEnergy: input.lastPlayedEnergy,
    remainingSlots: input.remainingSlots,
    candidates: mixed,
  });
  return { ...plan, result: { ...plan.result, tracklist: stampSpotify(plan.result.tracklist, byUri) } };
}

export interface ExtendInput {
  intent: SessionIntent;
  /** Already-played + currently-queued ids to exclude from the append pool. */
  playedIds: string[];
  /** How many fresh tracks to append (default 4). */
  appendSlots: number;
  /** Energy of the last queued track, to chain the continuation smoothly. */
  lastPlayedEnergy: number | null;
  energyWeights?: Partial<Record<number, number>>;
  /** Cross-session preference recall (condition C); "" for A/B. */
  memories?: string;
  /** Structured taste prefer/avoid (condition C); undefined for A/B. */
  taste?: TastePreference[];
  tieBreakSeed?: string;
  /** Cached Spotify library pool (ADR-0005 §10); re-ranked into the append, no fresh gather (#77). */
  spotifyCandidates?: SpotifyTrackRef[];
  /** uri→energy for the cached pool (catalog-match + LLM-inferred); resolved once per session (#74). */
  spotifyEnergyByUri?: Record<string, Energy>;
}

/**
 * Rolling extend (E1): deterministically append `appendSlots` fresh tracks so the
 * station stays on air past the initial arc. Retrieval excludes everything already
 * played/queued; ordering chains from the last queued energy via chooseNext. No Flow
 * LLM — extend is a fast background continuation, not a re-plan.
 */
export async function extendPlan(deps: PlanDeps, input: ExtendInput): Promise<PlanResult> {
  const effectiveEnergyWeights = mergeEnergyWeights(input.energyWeights, energyWeightsFromMemories(input.memories ?? ""));
  const tracks = deps.tracks();
  const exclude = new Set(input.playedIds);
  // Append from the same mixed pool (#77): cached Spotify library (minus already-
  // queued uris) ranked alongside the local catalog against the rolling target.
  const { pool: spotifyPool, byUri } = spotifyCandidatePool(input.spotifyCandidates, input.intent.scene, tracks, input.spotifyEnergyByUri);
  const candidates = [
    ...retrieveCandidates(tracks, {
      mood: input.intent.mood,
      scene: input.intent.scene,
      excludeIds: exclude,
      limit: Math.max(24, input.appendSlots * 3),
      slots: input.appendSlots,
      lastPlayedEnergy: input.lastPlayedEnergy,
      energyWeights: effectiveEnergyWeights,
      taste: input.taste,
      tieBreakSeed: input.tieBreakSeed,
    }),
    ...spotifyPool.filter((c) => !exclude.has(c.id)),
  ];
  const candidatesById = new Map(candidates.map((c) => [c.id, c]));
  const tracklist = stampSpotify(buildExtendChain(candidates, input.appendSlots, input.lastPlayedEnergy), byUri);
  return {
    result: { session_title: "", session_subtitle: "", arc: "peak", tracklist },
    violations: [],
    candidatesById,
  };
}

/** Greedy energy chain of up to `count` candidates, starting near `seedEnergy`. */
function buildExtendChain(candidates: TrackCandidate[], count: number, seedEnergy: number | null): FlowTrackRef[] {
  const pool = [...candidates];
  const slots: FlowTrackRef[] = [];
  let prev: TrackCandidate | undefined;

  for (let pos = 1; pos <= count && pool.length > 0; pos++) {
    const target = prev?.energy ?? seedEnergy ?? pool[0]!.energy;
    const pick = chooseNext(pool, target, prev);
    if (!pick) break;
    pool.splice(pool.indexOf(pick), 1);
    slots.push({ id: pick.id, flow_position: pos, reason: "rolling extend", source: "local" });
    prev = pick;
  }
  return slots;
}

/** Step 2 deterministic flow plan + safety-net validation (ADR-0001: no LLM retry/repair loop). */
async function runHeuristicFlow(input: FlowInput): Promise<PlanResult> {
  const candidatesById = new Map(input.candidates.map((c) => [c.id, c]));
  const result = await new HeuristicFlowModel().plan(input);
  const violations = validateTracklist(result.tracklist, candidatesById);
  return { result, violations, candidatesById };
}
