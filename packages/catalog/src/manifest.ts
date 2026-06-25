import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify, type CatalogManifest, type GenreTaxonomy, type Track, type TrackMeta } from "@auracle/shared";

const catalogRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Default manifest path (`packages/catalog/data/catalog/manifest.json`). */
export function defaultManifestPath(): string {
  return resolve(catalogRoot, "data/catalog/manifest.json");
}

/** Genre taxonomy path (`packages/catalog/data/catalog/genre_taxonomy.json`). */
export function genreTaxonomyPath(): string {
  return resolve(catalogRoot, "data/catalog/genre_taxonomy.json");
}

/** Catalog revision marker (`packages/catalog/data/catalog/.revision`). */
export function revisionPath(): string {
  return resolve(catalogRoot, "data/catalog/.revision");
}

export function loadCatalogManifest(path = defaultManifestPath()): CatalogManifest {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as CatalogManifest;
}

export function loadGenreTaxonomy(path = genreTaxonomyPath()): GenreTaxonomy {
  return JSON.parse(readFileSync(path, "utf8")) as GenreTaxonomy;
}

/** Content-addressed catalog revision: first 16 hex of sha256(manifest.json). */
export function computeCatalogRevision(path = defaultManifestPath()): string {
  return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex").slice(0, 16);
}

/** Recompute and persist `.revision`; returns the new revision. */
export function writeCatalogRevision(): string {
  const rev = computeCatalogRevision();
  writeFileSync(revisionPath(), `${rev}\n`);
  return rev;
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
      // Prefer manifest slugs; fall back to slugify when omitted.
      genreSlug: t.genreSlug ?? slugify(t.genre),
      artistSlug: artist.slug ?? slugify(artist.name),
      albumSlug: album.slug ?? slugify(album.title),
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
    genreSlug: track.genreSlug,
    artistSlug: track.artistSlug,
    albumSlug: track.albumSlug,
    mood: track.mood,
    scene: track.scene,
    filePath: track.filePath,
    introOffsetMs: track.introOffsetMs,
  };
}

/** Rich text for Phase 1 catalog embedding (ADR-0002). */
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
