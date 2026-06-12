import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { CatalogManifest, Track, TrackMeta } from "@auracle/shared";
import { config } from "../config.js";

// Catalog assets (manifest + tracks/covers/artists) live under config.catalogDataDir
// (apps/api/data during the migration). Paths in the manifest are relative to its parent.
const catalogRoot = dirname(config.catalogDataDir);

/** Default manifest path (`<catalogDataDir>/catalog/manifest.json`). */
export function defaultManifestPath(): string {
  return resolve(config.catalogDataDir, "catalog/manifest.json");
}

export function loadCatalogManifest(path = defaultManifestPath()): CatalogManifest {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as CatalogManifest;
}

export function resolveCatalogPath(relativePath: string): string {
  return resolve(catalogRoot, relativePath);
}

export function coverUrl(coverFile: string): string {
  return `/covers/${coverFile}`;
}

export function artistPhotoUrl(photoFile: string): string {
  return `/artists/${photoFile}`;
}

/** Tracks whose audio, cover, and artist photo all exist on disk. */
export function tracksWithAssets(manifest = loadCatalogManifest()): Track[] {
  return manifestToTracks(manifest).filter(
    (t) =>
      existsSync(resolveCatalogPath(t.filePath)) &&
      existsSync(resolveCatalogPath(t.albumCoverPath)) &&
      existsSync(resolveCatalogPath(t.artistPhotoPath)),
  );
}

/** Join manifest artists/albums/tracks into API-ready Track rows. */
export function manifestToTracks(manifest: CatalogManifest): Track[] {
  const artists = new Map(manifest.artists.map((a) => [a.id, a]));
  const albums = new Map(manifest.albums.map((a) => [a.id, a]));

  return manifest.tracks.map((t) => {
    const album = albums.get(t.albumId);
    if (!album) throw new Error(`Track ${t.id}: unknown album ${t.albumId}`);
    const artist = artists.get(album.artistId);
    if (!artist) throw new Error(`Album ${album.id}: unknown artist ${album.artistId}`);

    return {
      id: t.id,
      title: t.title,
      artist: artist.name,
      artistId: artist.id,
      albumId: album.id,
      albumTitle: album.title,
      lore: t.lore,
      albumCoverPath: `data/covers/${album.coverFile}`,
      artistPhotoPath: `data/artists/${artist.photoFile}`,
      energy: t.energy,
      tempo: t.tempo,
      genre: t.genre,
      mood: t.mood,
      scene: t.scene,
      filePath: t.filePath,
      introOffsetMs: t.introOffsetMs,
      instrumental: t.instrumental !== false,
      lyrics: t.lyrics,
      punOf: artist.punOf,
      vocalHomage: artist.vocalHomage,
      artistPersona: artist.persona,
    };
  });
}

export function toTrackMeta(track: Track): TrackMeta {
  const coverFile = track.albumCoverPath.replace(/^data\/covers\//, "");
  const photoFile = track.artistPhotoPath.replace(/^data\/artists\//, "");
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    albumId: track.albumId,
    albumTitle: track.albumTitle,
    albumCoverUrl: coverUrl(coverFile),
    artistPhotoUrl: artistPhotoUrl(photoFile),
    lore: track.lore,
    energy: track.energy,
    tempo: track.tempo,
    genre: track.genre,
    mood: track.mood,
    scene: track.scene,
    filePath: track.filePath,
    introOffsetMs: track.introOffsetMs,
  };
}

/** Rich text for catalog embedding (ADR-0002). */
export function buildRichEmbedText(track: Pick<Track, "artist" | "albumTitle" | "mood" | "scene" | "energy" | "genre" | "lore">): string {
  return [
    `artist: ${track.artist}`,
    `album: ${track.albumTitle}`,
    `mood: ${track.mood}`,
    `scene: ${track.scene}`,
    `energy: ${track.energy}`,
    `genre: ${track.genre}`,
    `lore: ${track.lore}`,
  ].join(" | ");
}
