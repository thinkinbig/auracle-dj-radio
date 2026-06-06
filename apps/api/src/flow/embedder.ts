import type { Track, TrackCandidate } from "@auracle/shared";

const EMBED_DIM = 768;

/** Minimal track fields needed to produce a tag embedding. */
type TagFields = Pick<Track, "mood" | "scene" | "energy" | "genre">;

/**
 * Domain-typed embedder. Callers never construct tag strings — the encoding
 * is an implementation detail hidden behind this seam.
 */
export interface Embedder {
  embedTrack(t: TagFields | TrackCandidate): Promise<number[]>;
  embedQuery(mood: string, scene: string): Promise<number[]>;
}

function tagText(mood: string, scene: string, energy?: number, genre?: string): string {
  const parts = [`mood: ${mood}`, `scene: ${scene}`];
  if (energy !== undefined) parts.push(`energy: ${energy}`);
  if (genre !== undefined) parts.push(`genre: ${genre}`);
  return parts.join(" ");
}

/**
 * Deterministic, offline embedder: hashes whitespace tokens into a fixed-dim
 * bag-of-words vector. Shared tokens → higher cosine, which is enough for the
 * demo and lets retrieval be unit-tested without a Gemini key.
 */
export class HashEmbedder implements Embedder {
  async embedTrack(t: TagFields | TrackCandidate): Promise<number[]> {
    return this.hash(tagText(t.mood, t.scene, t.energy, t.genre));
  }

  async embedQuery(mood: string, scene: string): Promise<number[]> {
    return this.hash(tagText(mood, scene));
  }

  private hash(text: string): number[] {
    const vec = new Array<number>(EMBED_DIM).fill(0);
    for (const token of text.toLowerCase().split(/\s+/).filter(Boolean)) {
      const idx = fnv32(token) % EMBED_DIM;
      vec[idx] = (vec[idx] ?? 0) + 1;
    }
    return vec;
  }
}

function fnv32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
