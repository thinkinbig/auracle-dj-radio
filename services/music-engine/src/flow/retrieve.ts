import type { TastePreference, TrackCandidate } from "@auracle/shared";
import { toCandidate } from "@auracle/shared";
import type { TrackRow } from "../catalog-db.js";
import type { Embedder } from "./embedder.js";
import { buildTasteWeighting } from "./taste-weighting.js";

export interface RetrieveInput {
  mood: string;
  scene: string;
  excludeIds?: Set<string>;
  limit?: number;
  /** Energy-level skip weights (1–5 → 0–0.7): penalises tracks at energies the user often skips. */
  energyWeights?: Partial<Record<number, number>>;
  /** Structured taste prefer/avoid (Epic #3, S4): boosts/penalises matching tracks. */
  taste?: TastePreference[];
}

export interface Scored<T> {
  item: T;
  score: number;
}

/** Step 1 — embed the mood/scene query and return the top-K candidate tracks by cosine. */
export async function retrieveCandidates(
  embedder: Embedder,
  tracks: TrackRow[],
  input: RetrieveInput,
): Promise<TrackCandidate[]> {
  const query = await embedder.embedQuery(input.mood, input.scene);
  const pool = input.excludeIds ? tracks.filter((t) => !input.excludeIds!.has(t.id)) : tracks;
  const weights = input.energyWeights;
  const hasEnergy = weights && Object.keys(weights).length > 0;
  const taste = input.taste && input.taste.length > 0 ? buildTasteWeighting(input.taste) : undefined;
  // Combine skip-energy and structured-taste multipliers onto the cosine score.
  const adjust =
    hasEnergy || taste
      ? (t: TrackRow, score: number) =>
          score * (hasEnergy ? 1 - (weights[t.energy] ?? 0) : 1) * (taste ? taste.multiplierFor(t) : 1)
      : undefined;
  const ranked = topK(query, pool, (t) => t.embedding, input.limit ?? 24, adjust);
  return ranked.map((s) => toCandidate(s.item));
}

function topK<T>(
  query: number[],
  items: T[],
  vectorOf: (item: T) => number[] | null,
  k: number,
  adjust?: (item: T, score: number) => number,
): Scored<T>[] {
  const scored: Scored<T>[] = [];
  for (const item of items) {
    const v = vectorOf(item);
    if (!v) continue;
    const raw = cosineSimilarity(query, v);
    scored.push({ item, score: adjust ? adjust(item, raw) : raw });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`);
  }
  if (a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
