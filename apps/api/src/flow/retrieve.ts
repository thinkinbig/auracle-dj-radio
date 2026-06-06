import type { TrackCandidate } from "@auracle/shared";
import { toCandidate } from "@auracle/shared";
import type { TrackRow } from "../db/index.js";
import type { Embedder } from "./embedder.js";

export interface RetrieveInput {
  mood: string;
  scene: string;
  excludeIds?: Set<string>;
  limit?: number;
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
  const ranked = topK(query, pool, (t) => t.embedding, input.limit ?? 24);
  return ranked.map((s) => toCandidate(s.item));
}

function topK<T>(query: number[], items: T[], vectorOf: (item: T) => number[] | null, k: number): Scored<T>[] {
  const scored: Scored<T>[] = [];
  for (const item of items) {
    const v = vectorOf(item);
    if (!v) continue;
    scored.push({ item, score: cosineSimilarity(query, v) });
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
