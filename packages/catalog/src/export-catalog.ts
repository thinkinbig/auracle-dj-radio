import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GenreCount } from "@auracle/shared";
import { computeCatalogRevision, loadGenreTaxonomy, tracksWithAssets, toTrackMeta, writeCatalogRevision } from "./manifest.js";

/**
 * Export the browser-facing catalog as static JSON so nginx (prod) and the Vite
 * dev middleware serve it without a running api service. Mirrors the read-only
 * endpoints the web app consumes:
 *   GET /catalog/tracks  → data/catalog/tracks.json     ({ revision, tracks: TrackMeta[] })
 *   GET /catalog/genres  → data/catalog/genres.json      ({ revision, genres: GenreCount[] })
 *   GET /tracks/:id      → data/catalog/track/<id>.json (TrackMeta)
 * Re-run after editing data/catalog/manifest.json (run `backfill` first).
 */
const catalogDir = resolve(dirname(fileURLToPath(import.meta.url)), "../data/catalog");
const trackDir = resolve(catalogDir, "track");

const tracks = tracksWithAssets().map(toTrackMeta);
const revision = computeCatalogRevision();

writeFileSync(resolve(catalogDir, "tracks.json"), JSON.stringify({ revision, tracks }));

// Taxonomy slugs + per-genre counts (same shape as GET /catalog/genres).
const counts = new Map<string, number>();
for (const t of tracks) counts.set(t.genreSlug, (counts.get(t.genreSlug) ?? 0) + 1);
const genres: GenreCount[] = loadGenreTaxonomy().genres.map((g) => ({ ...g, count: counts.get(g.slug) ?? 0 }));
writeFileSync(resolve(catalogDir, "genres.json"), JSON.stringify({ revision, genres }));

rmSync(trackDir, { recursive: true, force: true });
mkdirSync(trackDir, { recursive: true });
for (const t of tracks) {
  writeFileSync(resolve(trackDir, `${t.id}.json`), JSON.stringify(t));
}

writeCatalogRevision();
console.log(`export-catalog: wrote ${tracks.length} tracks + ${genres.length} genres (rev ${revision}) → ${catalogDir}`);
