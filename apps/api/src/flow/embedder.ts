import type { Track, TrackCandidate } from "@auracle/shared";
import { buildRichEmbedText } from "../catalog/manifest.js";

const EMBED_DIM = 768;

/** Fields used for catalog embedding (audio clip + metadata fallback). */
export type EmbedTrackInput = Pick<
  Track,
  "filePath" | "artist" | "albumTitle" | "mood" | "scene" | "energy" | "genre" | "lore"
> &
  Partial<Pick<TrackCandidate, "mood" | "scene" | "energy" | "genre">>;

/**
 * Domain-typed embedder. Callers never construct tag strings — the encoding
 * is an implementation detail hidden behind this seam.
 */
export interface Embedder {
  embedTrack(t: EmbedTrackInput): Promise<number[]>;
  embedQuery(mood: string, scene: string): Promise<number[]>;
}

/** Retrieval query text — mood/scene are listener feel + doing (SessionIntent). */
export function formatEmbedQuery(mood: string, scene: string): string {
  return `task: search result | query: feel: ${mood} | doing: ${scene}`;
}

function queryText(mood: string, scene: string): string {
  // Hash embedder: keep mood/scene tokens so offline vectors overlap track metadata.
  return `${formatEmbedQuery(mood, scene)} | mood: ${mood} | scene: ${scene}`;
}

function trackText(t: EmbedTrackInput): string {
  if (t.lore && t.artist && t.albumTitle) {
    return buildRichEmbedText({
      artist: t.artist,
      albumTitle: t.albumTitle,
      mood: t.mood,
      scene: t.scene,
      energy: t.energy,
      genre: t.genre,
      lore: t.lore,
    });
  }
  return [`mood: ${t.mood}`, `scene: ${t.scene}`, `energy: ${t.energy}`, `genre: ${t.genre}`].join(" | ");
}

/**
 * Deterministic, offline embedder: hashes whitespace tokens into a fixed-dim
 * bag-of-words vector. Shared tokens → higher cosine, which is enough for the
 * demo and lets retrieval be unit-tested without a Gemini key.
 */
export class HashEmbedder implements Embedder {
  async embedTrack(t: EmbedTrackInput): Promise<number[]> {
    return this.hash(trackText(t));
  }

  async embedQuery(mood: string, scene: string): Promise<number[]> {
    return this.hash(queryText(mood, scene));
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
