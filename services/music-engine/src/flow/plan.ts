import type { Energy, FlowResult, PlannedTrack, SessionIntent, TastePreference, TrackCandidate, TrackSeed, Voicing } from "@auracle/shared";
import { FULL_SESSION_LENGTH, energyTargetsForMood } from "@auracle/shared";
import type { TrackRow } from "../catalog-db.js";
import { HeuristicFlowModel } from "./llm/heuristic-flow.js";
import type { FlowInput, FlowPlan, FlowSlot } from "./llm/flow-model.js";
import { createSessionTitle } from "./session-title.js";
import { energyWeightsFromMemories, mergeEnergyWeights } from "./weighting/memory-energy.js";
import { retrieveCandidates } from "./retrieval/retrieve.js";
import { tasteCacheKey } from "./weighting/taste-weighting.js";
import { validateTracklist, type Violation } from "./validation/validate.js";
import { chooseNext } from "./selection/choose-next.js";

/** Resolved energy + DJ voicing for externally-seeded tracks that have no catalog match. */
export interface SeedResolution {
  energy: Record<string, Energy>;
  voicing: Record<string, Voicing>;
}

export interface PlanDeps {
  /** Returns the full track library (read from SQLite at call time). */
  tracks: () => TrackRow[];
  /**
   * Resolve energy + DJ voicing for seeded tracks with no exact catalog match
   * (ADR-0005 §4–5) — LLM inference, memoized by uri. Optional: on the fast
   * provisional path, or in tests, it is omitted and unmatched seeds fall back to
   * a mid-arc placeholder energy and empty voicing until a full plan resolves them.
   */
  resolveSeeds?: (seeds: TrackSeed[]) => Promise<SeedResolution>;
}

/**
 * Fallback energy for a seeded track with no resolved value yet (the fast
 * provisional path): it sits mid-arc so `chooseNext` can still rank it against
 * catalog tracks on this one axis until a full plan infers its real energy.
 */
const PLACEHOLDER_ENERGY: Energy = 3;
const EMPTY_VOICING: Voicing = { artistPersona: "", albumConcept: "", lore: "" };

/** Normalize a title/artist for tolerant equality (case, punctuation, spacing). */
function normalizeMatchKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Exact catalog reuse (ADR-0005 §4–5): when a seeded track is the same recording
 * as one in our catalog (normalized title+artist), reuse its authored energy and
 * DJ voicing rather than inferring them. Returns uri→energy and uri→voicing of hits.
 */
function matchCatalog(
  tracks: TrackRow[],
  seeds: TrackSeed[],
): { energy: Record<string, Energy>; voicing: Record<string, Voicing> } {
  const byTitleArtist = new Map<string, TrackRow>();
  for (const t of tracks) {
    byTitleArtist.set(`${normalizeMatchKey(t.title)} | ${normalizeMatchKey(t.artist)}`, t);
  }
  const energy: Record<string, Energy> = {};
  const voicing: Record<string, Voicing> = {};
  for (const s of seeds) {
    const t = byTitleArtist.get(`${normalizeMatchKey(s.title)} | ${normalizeMatchKey(s.artist)}`);
    if (!t) continue;
    energy[s.uri] = t.energy;
    voicing[s.uri] = { artistPersona: t.artistPersona ?? "", albumConcept: t.albumConcept ?? "", lore: t.lore ?? "" };
  }
  return { energy, voicing };
}

/** Rankable seed pool + the lookups needed to stamp picked slots back into PlannedTracks. */
interface SeedContext {
  pool: TrackCandidate[];
  byUri: Map<string, TrackSeed>;
  energyByUri: Record<string, Energy>;
  voicingByUri: Record<string, Voicing>;
}

const EMPTY_SEED_CONTEXT: SeedContext = { pool: [], byUri: new Map(), energyByUri: {}, voicingByUri: {} };

/**
 * Turn seeded tracks into a rankable pool with resolved energy/voicing. Catalog
 * matches always win (free, exact); `resolve` (full path) fills the remainder via
 * LLM inference, absent (provisional path) they stay placeholder/empty. Ranking
 * uses the resolved energy so a seeded track sits at its true arc position.
 */
async function buildSeedContext(
  seeds: TrackSeed[] | undefined,
  scene: string,
  tracks: TrackRow[],
  resolve?: (seeds: TrackSeed[]) => Promise<SeedResolution>,
): Promise<SeedContext> {
  if (!seeds?.length) return EMPTY_SEED_CONTEXT;
  const byUri = new Map<string, TrackSeed>();
  for (const s of seeds) if (!byUri.has(s.uri)) byUri.set(s.uri, s);
  const list = [...byUri.values()];

  const { energy: matchedEnergy, voicing: matchedVoicing } = matchCatalog(tracks, list);
  let energyByUri: Record<string, Energy> = { ...matchedEnergy };
  let voicingByUri: Record<string, Voicing> = { ...matchedVoicing };
  if (resolve) {
    const unmatched = list.filter((s) => matchedEnergy[s.uri] === undefined || matchedVoicing[s.uri] === undefined);
    if (unmatched.length) {
      const inferred = await resolve(unmatched);
      // Catalog matches override inference (authored beats guessed).
      energyByUri = { ...inferred.energy, ...matchedEnergy };
      voicingByUri = { ...inferred.voicing, ...matchedVoicing };
    }
  }

  const pool: TrackCandidate[] = list.map((s) => ({
    id: s.uri,
    energy: energyByUri[s.uri] ?? PLACEHOLDER_ENERGY,
    tempo: 0,
    genre: "",
    scene,
  }));
  return { pool, byUri, energyByUri, voicingByUri };
}

/**
 * Stamp ordered flow slots into self-describing PlannedTracks. Both backends land
 * on the same shape: `id` is the join key, `uri` carries the scheme the player
 * reads (`local:<id>` or the seed uri), and metadata/energy/voicing are inline.
 * Local duration isn't in the catalog — the LocalPlayer discovers it at load — so
 * it's stamped 0 here, matching how the client has always treated local length.
 */
function stampPlanned(slots: FlowSlot[], tracks: TrackRow[], seed: SeedContext): PlannedTrack[] {
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  return slots.map((s): PlannedTrack => {
    const ref = seed.byUri.get(s.id);
    if (ref) {
      return {
        id: s.id,
        uri: ref.uri,
        flow_position: s.flow_position,
        reason: s.reason,
        title: ref.title,
        artist: ref.artist,
        albumTitle: ref.albumTitle,
        albumCoverUrl: ref.albumCoverUrl,
        durationSec: ref.durationSec,
        energy: seed.energyByUri[s.id] ?? PLACEHOLDER_ENERGY,
        voicing: seed.voicingByUri[s.id] ?? EMPTY_VOICING,
      };
    }
    const t = trackById.get(s.id);
    return {
      id: s.id,
      uri: `local:${s.id}`,
      flow_position: s.flow_position,
      reason: s.reason,
      title: t?.title ?? s.id,
      artist: t?.artist ?? "",
      albumTitle: t?.albumTitle ?? "",
      albumCoverUrl: t?.albumCoverPath ?? "",
      durationSec: 0,
      energy: t?.energy ?? PLACEHOLDER_ENERGY,
      voicing: t
        ? { artistPersona: t.artistPersona ?? "", albumConcept: t.albumConcept ?? "", lore: t.lore ?? "" }
        : EMPTY_VOICING,
    };
  });
}

export interface PlanResult {
  result: FlowResult;
  violations: Violation[];
  candidatesById: Map<string, TrackCandidate>;
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
  seeds?: TrackSeed[],
): Promise<PlanResult> {
  // A mixed pool is per-user (the listener's own seeded library), so it must not
  // be served from — or written to — the shared catalog-only plan cache.
  if (seeds?.length) {
    return createPlan(deps, intent, memories, energyWeights, taste, tieBreakSeed, seeds);
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
 * background. Also the graceful fallback if that refine fails. Seeds are matched
 * against the catalog (free) but not LLM-resolved here — that waits for the full plan.
 */
export async function createProvisionalPlan(
  deps: PlanDeps,
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
  tieBreakSeed?: string,
  seeds?: TrackSeed[],
): Promise<{ result: FlowResult; candidatesById: Map<string, TrackCandidate> }> {
  const effectiveEnergyWeights = mergeEnergyWeights(energyWeights, energyWeightsFromMemories(memories));
  const tracks = deps.tracks();
  const seed = await buildSeedContext(seeds, intent.scene, tracks);
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
    ...seed.pool,
  ];
  const candidatesById = new Map(candidates.map((c) => [c.id, c]));
  return {
    result: {
      session_title: provisionalTitle(intent, tieBreakSeed),
      session_subtitle: `${intent.duration_min} min`,
      arc: "warm_up",
      tracklist: stampPlanned(buildProvisionalArc(candidates, intent.mood), tracks, seed),
    },
    candidatesById,
  };
}

/** Fill starter slots by closest candidate energy to the mood-dependent arc targets. */
function buildProvisionalArc(candidates: TrackCandidate[], mood: string): FlowSlot[] {
  const pool = [...candidates];
  const slots: FlowSlot[] = [];
  const targets = energyTargetsForMood(FULL_SESSION_LENGTH, mood, null);
  let prev: TrackCandidate | undefined;

  targets.forEach((target, i) => {
    const pick = chooseNext(pool, target, prev);
    if (!pick) return;
    pool.splice(pool.indexOf(pick), 1);
    slots.push({ id: pick.id, flow_position: i + 1, reason: "mood arc target " + target.toFixed(1) + " (provisional)" });
    prev = pick;
  });

  return slots;
}

function provisionalTitle(intent: SessionIntent, tieBreakSeed?: string): string {
  return createSessionTitle(intent, tieBreakSeed);
}

/** Initial session plan: Step 1 retrieval → Step 2 Flow over a fresh 8-track arc. */
export async function createPlan(
  deps: PlanDeps,
  intent: SessionIntent,
  memories = "",
  energyWeights?: Partial<Record<number, number>>,
  taste?: TastePreference[],
  tieBreakSeed?: string,
  seeds?: TrackSeed[],
): Promise<PlanResult> {
  const effectiveEnergyWeights = mergeEnergyWeights(energyWeights, energyWeightsFromMemories(memories));
  const tracks = deps.tracks();
  const seed = await buildSeedContext(seeds, intent.scene, tracks, deps.resolveSeeds);
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
    ...seed.pool,
  ];
  const plan = await runHeuristicFlow({
    intent,
    memories,
    played: [],
    lastPlayedEnergy: null,
    remainingSlots: FULL_SESSION_LENGTH,
    candidates,
    tieBreakSeed,
  });
  return {
    result: { ...plan.result, tracklist: stampPlanned(plan.tracklist, tracks, seed) },
    violations: plan.violations,
    candidatesById: plan.candidatesById,
  };
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
  /** Cached seeded library pool (ADR-0005 §10); re-ranked into the refill, no fresh gather (#77). */
  seeds?: TrackSeed[];
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
  // Re-rank the cached seeded pool into the same refill (#77): the library is
  // static per session, so no fresh gather. Resolution is memoized by uri, so a
  // replan reuses the energy/voicing the full plan already inferred. Exclude
  // played/kept slots — and, on a re-roll, the slots being replaced.
  const seed = await buildSeedContext(input.seeds, input.intent.scene, tracks, deps.resolveSeeds);
  const seedExclude = new Set([...input.playedIds, ...(input.avoidIds ?? [])]);
  const mixed = [...candidates, ...seed.pool.filter((c) => !seedExclude.has(c.id))];
  const plan = await runHeuristicFlow({
    intent: input.intent,
    memories: input.memories ?? "",
    played: input.played,
    lastPlayedEnergy: input.lastPlayedEnergy,
    remainingSlots: input.remainingSlots,
    candidates: mixed,
    tieBreakSeed: input.tieBreakSeed,
  });
  return {
    result: { ...plan.result, tracklist: stampPlanned(plan.tracklist, tracks, seed) },
    violations: plan.violations,
    candidatesById: plan.candidatesById,
  };
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
  /** Cached seeded library pool (ADR-0005 §10); re-ranked into the append, no fresh gather (#77). */
  seeds?: TrackSeed[];
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
  // Append from the same mixed pool (#77): cached seeded library (minus already-
  // queued uris) ranked alongside the catalog against the rolling target. Seed
  // resolution is memoized by uri, so extend reuses the full plan's inference.
  const seed = await buildSeedContext(input.seeds, input.intent.scene, tracks, deps.resolveSeeds);
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
    ...seed.pool.filter((c) => !exclude.has(c.id)),
  ];
  const candidatesById = new Map(candidates.map((c) => [c.id, c]));
  const tracklist = stampPlanned(buildExtendChain(candidates, input.appendSlots, input.lastPlayedEnergy), tracks, seed);
  return {
    result: { session_title: "", session_subtitle: "", arc: "peak", tracklist },
    violations: [],
    candidatesById,
  };
}

/** Greedy energy chain of up to `count` candidates, starting near `seedEnergy`. */
function buildExtendChain(candidates: TrackCandidate[], count: number, seedEnergy: number | null): FlowSlot[] {
  const pool = [...candidates];
  const slots: FlowSlot[] = [];
  let prev: TrackCandidate | undefined;

  for (let pos = 1; pos <= count && pool.length > 0; pos++) {
    const target = prev?.energy ?? seedEnergy ?? pool[0]!.energy;
    const pick = chooseNext(pool, target, prev);
    if (!pick) break;
    pool.splice(pool.indexOf(pick), 1);
    slots.push({ id: pick.id, flow_position: pos, reason: "rolling extend" });
    prev = pick;
  }
  return slots;
}

/** Step 2 deterministic flow plan + safety-net validation (ADR-0001: no LLM retry/repair loop). */
async function runHeuristicFlow(input: FlowInput): Promise<{ result: FlowResult; tracklist: FlowSlot[]; violations: Violation[]; candidatesById: Map<string, TrackCandidate> }> {
  const candidatesById = new Map(input.candidates.map((c) => [c.id, c]));
  const plan: FlowPlan = await new HeuristicFlowModel().plan(input);
  const violations = validateTracklist(plan.tracklist, candidatesById);
  // `result` carries everything but the tracklist, which the caller stamps into
  // PlannedTracks; `tracklist` is the lean ordered slots to stamp.
  return {
    result: { session_title: plan.session_title, session_subtitle: plan.session_subtitle, arc: plan.arc, tracklist: [] },
    tracklist: plan.tracklist,
    violations,
    candidatesById,
  };
}
