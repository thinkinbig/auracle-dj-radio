import type { TastePreference, TrackCandidate } from "@auracle/shared";
import { createMoodEnergyProfile, toCandidate } from "@auracle/shared";
import type { TrackRow } from "../../catalog-db.js";
import { buildTasteScorer, type TasteScorer } from "../weighting/taste-weighting.js";

export interface RetrieveInput {
  mood: string;
  scene: string;
  excludeIds?: Set<string>;
  limit?: number;
  /** Energy-level skip weights (1–5 → 0–0.7): penalises tracks at energies the user often skips. */
  energyWeights?: Partial<Record<number, number>>;
  /** Structured taste prefer/avoid (Epic #3, S4): reranks matching tracks within the mood envelope. */
  taste?: TastePreference[];
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

export function scoreRetrievalCandidate(
  track: Pick<TrackRow, "energy" | "id" | "genreSlug" | "artistSlug" | "albumSlug" | "scene">,
  input: RetrievalScoreInput = {},
): RetrievalScoreBreakdown {
  const mood = input.mood ?? "focused";
  const profile = createMoodEnergyProfile(mood, input.k);
  const energyPenalty = profile.penalty(track.energy);
  const scene = sceneFit(track.scene, input.scene ?? "");
  const genre = genreFit(track.genreSlug, input.preferredGenres ?? new Set());
  const tasteScore = input.taste?.scoreFor(track) ?? 0;
  const skipPenalty = input.energyWeights?.[track.energy] ?? 0;
  const score = -energyPenalty + scene + genre + TASTE_WEIGHT * tasteScore - SKIP_PENALTY_WEIGHT * skipPenalty;
  return { energyPenalty, sceneFit: scene, genreFit: genre, tasteScore, skipPenalty, score };
}

/** Step 1 — structured mood/scene scoring; no embedding (ADR-0001). */
export function retrieveCandidates(tracks: TrackRow[], input: RetrieveInput): TrackCandidate[] {
  const pool = input.excludeIds ? tracks.filter((t) => !input.excludeIds!.has(t.id)) : tracks;
  const taste = input.taste && input.taste.length > 0 ? buildTasteScorer(input.taste) : undefined;
  const preferredGenres = preferredGenresFromTaste(input.taste);
  const scoreInput: RetrievalScoreInput = {
    mood: input.mood,
    scene: input.scene,
    taste,
    energyWeights: input.energyWeights,
    preferredGenres,
  };
  const ranked = rankByScore(pool, (t) => scoreRetrievalCandidate(t, scoreInput).score, input.limit ?? 24);
  return ranked.map((s) => toCandidate(s.item));
}

function rankByScore<T>(items: T[], scoreOf: (item: T) => number, k: number): Scored<T>[] {
  const scored = items.map((item) => ({ item, score: scoreOf(item) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
