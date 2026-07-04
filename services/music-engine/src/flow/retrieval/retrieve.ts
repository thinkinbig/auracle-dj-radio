import type { TastePreference, TrackCandidate } from "@auracle/shared";
import { FULL_SESSION_LENGTH, createMoodEnergyProfile, energyTargetsForMood, toCandidate } from "@auracle/shared";
import type { TrackRow } from "../../catalog-store.js";
import { buildTasteScorer, type TasteScorer } from "../weighting/taste-weighting.js";

export interface RetrieveInput {
  mood: string;
  scene: string;
  excludeIds?: Set<string>;
  limit?: number;
  /** Arc slot count used to compute energy buckets (defaults to FULL_SESSION_LENGTH). */
  slots?: number;
  /** Last played energy for replan glide; null/undefined = fresh session. */
  lastPlayedEnergy?: number | null;
  /** Energy-level skip weights (1–5 → 0–0.7): penalises tracks at energies the user often skips. */
  energyWeights?: Partial<Record<number, number>>;
  /** Structured taste prefer/avoid (Epic #3, S4): reranks matching tracks within the mood envelope. */
  taste?: TastePreference[];
  /** Stable seed used to rotate equal-score tracks without catalog-order bias. */
  tieBreakSeed?: string;
}

export interface Scored<T> {
  item: T;
  score: number;
}

export interface RetrievalScoreInput {
  mood?: string;
  scene?: string;
  k?: number;
  taste?: TasteScorer;
  energyWeights?: Partial<Record<number, number>>;
  preferredGenres?: ReadonlySet<string>;
}

export interface RetrievalScoreBreakdown {
  energyPenalty: number;
  sceneFit: number;
  genreFit: number;
  tasteScore: number;
  skipPenalty: number;
  score: number;
}

const TASTE_WEIGHT = 0.25;
const SKIP_PENALTY_WEIGHT = 0.3;

const SCENE_ALIASES: Record<string, string> = {
  studying: "study",
  workout: "gym",
};

export function normalizeScene(scene: string): string {
  const s = scene.trim().toLowerCase();
  return SCENE_ALIASES[s] ?? s;
}

export function sceneFit(trackScene: string, intentScene: string): number {
  return normalizeScene(trackScene) === normalizeScene(intentScene) ? 1 : 0;
}

export function genreFit(trackGenreSlug: string, preferredGenres: ReadonlySet<string>): number {
  return preferredGenres.size > 0 && preferredGenres.has(trackGenreSlug) ? 1 : 0;
}

export function preferredGenresFromTaste(prefs: TastePreference[] | undefined): Set<string> {
  const set = new Set<string>();
  if (!prefs) return set;
  for (const p of prefs) {
    if (p.entityType === "genre" && p.polarity === "prefer") set.add(p.entityId);
  }
  return set;
}

type FitTrack = Pick<TrackRow, "energy" | "id" | "genreSlug" | "artistSlug" | "albumSlug" | "scene">;

interface FitBreakdown {
  sceneFit: number;
  genreFit: number;
  tasteScore: number;
  skipPenalty: number;
  /** scene + genre + taste − skip; the energy-independent part shared by both scorers. */
  fit: number;
}

/**
 * Energy-independent fit: scene + genre + taste − skip. Production retrieval ranks
 * within a fixed-energy bucket by this; `scoreRetrievalCandidate` adds the mood
 * energy penalty on top. One core so the tested scorer matches the live ranker.
 */
function fitScore(track: FitTrack, input: Omit<RetrievalScoreInput, "mood" | "k">): FitBreakdown {
  const scene = sceneFit(track.scene, input.scene ?? "");
  const genre = genreFit(track.genreSlug, input.preferredGenres ?? new Set());
  const tasteScore = input.taste?.scoreFor(track) ?? 0;
  const skipPenalty = input.energyWeights?.[track.energy] ?? 0;
  const fit = scene + genre + TASTE_WEIGHT * tasteScore - SKIP_PENALTY_WEIGHT * skipPenalty;
  return { sceneFit: scene, genreFit: genre, tasteScore, skipPenalty, fit };
}

export function scoreRetrievalCandidate(
  track: FitTrack,
  input: RetrievalScoreInput = {},
): RetrievalScoreBreakdown {
  const mood = input.mood ?? "focused";
  const energyPenalty = createMoodEnergyProfile(mood, input.k).penalty(track.energy);
  const f = fitScore(track, input);
  return { energyPenalty, sceneFit: f.sceneFit, genreFit: f.genreFit, tasteScore: f.tasteScore, skipPenalty: f.skipPenalty, score: -energyPenalty + f.fit };
}

/**
 * Step 1 — stratified candidate retrieval; no embedding (ADR-0001).
 *
 * Instead of a global mood-energy score that collapses the pool to a single
 * energy level, we compute which energy buckets the arc actually visits
 * (floor + ceil of each arc target) and take the top-K tracks per bucket
 * ranked by scene/taste fit only. The heuristic flow then sequences them
 * along the arc targets, giving a natural glide for replans and arc variety
 * for fresh sessions.
 */
export function retrieveCandidates(tracks: TrackRow[], input: RetrieveInput): TrackCandidate[] {
  const pool = input.excludeIds ? tracks.filter((t) => !input.excludeIds!.has(t.id)) : tracks;
  const taste = input.taste && input.taste.length > 0 ? buildTasteScorer(input.taste) : undefined;
  const preferredGenres = preferredGenresFromTaste(input.taste);

  const slots = input.slots ?? FULL_SESSION_LENGTH;
  const arcTargets = energyTargetsForMood(slots, input.mood, input.lastPlayedEnergy ?? null);
  const buckets = arcEnergyBuckets(arcTargets);
  const perBucket = Math.ceil((input.limit ?? 24) / buckets.size);

  const candidates: TrackCandidate[] = [];
  for (const e of buckets) {
    const bucket = pool.filter((t) => t.energy === e);
    const ranked = rankByFit(bucket, input.scene, preferredGenres, taste, input.energyWeights, perBucket, input.tieBreakSeed);
    for (const { item } of ranked) candidates.push(toCandidate(item));
  }
  return candidates;
}

/** Unique integer energy levels touched by the arc targets (floor + ceil of each target). */
function arcEnergyBuckets(targets: number[]): Set<number> {
  const buckets = new Set<number>();
  for (const t of targets) {
    buckets.add(Math.max(1, Math.floor(t)));
    buckets.add(Math.min(5, Math.ceil(t)));
  }
  return buckets;
}

/** Score tracks within a single energy bucket by scene/taste fit (no mood energy penalty). */
function rankByFit(
  tracks: TrackRow[],
  scene: string,
  preferredGenres: ReadonlySet<string>,
  taste: TasteScorer | undefined,
  energyWeights: Partial<Record<number, number>> | undefined,
  limit: number,
  tieBreakSeed: string | undefined,
): Scored<TrackRow>[] {
  const scored = tracks.map((item) => ({
    item,
    score: fitScore(item, { scene, preferredGenres, taste, energyWeights }).fit,
  }));
  scored.sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (scoreDelta !== 0) return scoreDelta;
    if (!tieBreakSeed) return 0;
    return tieBreakValue(tieBreakSeed, a.item.id) - tieBreakValue(tieBreakSeed, b.item.id);
  });
  return scored.slice(0, limit);
}

function tieBreakValue(seed: string, id: string): number {
  let hash = 0x811c9dc5;
  const input = seed + ":" + id;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
