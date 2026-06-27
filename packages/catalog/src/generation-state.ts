import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogAlbum, CatalogArtist, CatalogTrack } from "@auracle/shared";

const catalogRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface GenerationState {
  tracks: Record<string, { fingerprint: string }>;
  covers: Record<string, { fingerprint: string }>;
  artistPhotos: Record<string, { fingerprint: string }>;
}

export function generationStatePath(): string {
  return resolve(catalogRoot, "data/catalog/generation-state.json");
}

export function loadGenerationState(path = generationStatePath()): GenerationState {
  if (!existsSync(path)) {
    return { tracks: {}, covers: {}, artistPhotos: {} };
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<GenerationState>;
  return {
    tracks: raw.tracks ?? {},
    covers: raw.covers ?? {},
    artistPhotos: raw.artistPhotos ?? {},
  };
}

export function saveGenerationState(state: GenerationState, path = generationStatePath()): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

/** Fingerprint of manifest fields that affect Lyria output — prompt-template edits alone do not change this. */
export function trackGenerationFingerprint(
  track: CatalogTrack,
  artist: CatalogArtist,
  album: CatalogAlbum,
): string {
  return hashPayload({
    track: {
      id: track.id,
      title: track.title,
      energy: track.energy,
      tempo: track.tempo,
      genre: track.genre,
      genreSlug: track.genreSlug,
      mood: track.mood,
      scene: track.scene,
      instrumental: track.instrumental,
      lyrics: track.lyrics,
      lore: track.lore,
    },
    artist: {
      slug: artist.slug,
      persona: artist.persona,
      vocalHomage: artist.vocalHomage,
    },
    album: {
      title: album.title,
      concept: album.concept,
    },
  });
}

/** Fingerprint for album cover generation (manifest + title overlay). */
export function coverGenerationFingerprint(artist: CatalogArtist, album: CatalogAlbum): string {
  return hashPayload({
    album: {
      id: album.id,
      title: album.title,
      concept: album.concept,
      coverSubject: album.coverSubject,
      coverFile: album.coverFile,
    },
    artist: {
      slug: artist.slug,
      visualHomage: artist.visualHomage,
      name: artist.name,
    },
  });
}

/** Fingerprint for artist press portrait generation. */
export function artistPhotoGenerationFingerprint(artist: CatalogArtist): string {
  return hashPayload({
    artist: {
      id: artist.id,
      name: artist.name,
      persona: artist.persona,
      photoSubject: artist.photoSubject,
      photoFile: artist.photoFile,
      visualHomage: artist.visualHomage,
    },
  });
}

export type RegenerateDecision = "generate" | "skip";

export interface RegenerateInput {
  fingerprint: string;
  assetPath: string;
  storedFingerprint: string | undefined;
  force: boolean;
}

/**
 * Skip when the asset exists and manifest inputs are unchanged.
 * Existing assets without a stored fingerprint are bootstrapped (recorded, not regenerated).
 */
export function decideRegenerate(input: RegenerateInput): RegenerateDecision {
  if (input.force) return "generate";
  if (!existsSync(input.assetPath)) return "generate";
  if (!input.storedFingerprint) return "skip";
  if (input.storedFingerprint !== input.fingerprint) return "generate";
  return "skip";
}
