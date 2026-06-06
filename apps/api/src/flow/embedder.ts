import type { Track, TrackCandidate } from "@auracle/shared";

export const EMBED_DIM = 768;

export interface Embedder {
  embed(text: string): Promise<number[]>;
}

/** Canonical tag text used both at index time and query time. */
export function trackTagText(t: Pick<Track, "mood" | "scene" | "energy" | "genre"> | TrackCandidate): string {
  return `mood: ${t.mood} scene: ${t.scene} energy: ${t.energy} genre: ${t.genre}`;
}

export function queryTagText(mood: string, scene: string): string {
  return `mood: ${mood} scene: ${scene}`;
}

/**
 * Deterministic, offline embedder: hashes whitespace tokens into a fixed-dim
 * bag-of-words vector. Shared tokens → higher cosine, which is enough for the
 * demo and lets retrieval be unit-tested without a Gemini key.
 */
export class HashEmbedder implements Embedder {
  constructor(private readonly dim = EMBED_DIM) {}

  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(this.dim).fill(0);
    for (const token of text.toLowerCase().split(/\s+/).filter(Boolean)) {
      const idx = hash(token) % this.dim;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
    return vec;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
