/** Cosine similarity of two equal-length vectors. Returns 0 for degenerate input. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
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

export interface Scored<T> {
  item: T;
  score: number;
}

/** Top-k items by cosine similarity of `vectorOf(item)` against `query`. */
export function topK<T>(query: number[], items: T[], vectorOf: (item: T) => number[] | null, k: number): Scored<T>[] {
  const scored: Scored<T>[] = [];
  for (const item of items) {
    const v = vectorOf(item);
    if (!v) continue;
    scored.push({ item, score: cosineSimilarity(query, v) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
