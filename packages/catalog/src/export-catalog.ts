import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tracksWithAssets, toTrackMeta } from "./manifest.js";

/**
 * Export the browser-facing catalog as static JSON so nginx (prod) and the Vite
 * dev middleware serve it without a running api service. Mirrors the two
 * read-only endpoints the web app consumes:
 *   GET /catalog/tracks  → data/catalog/tracks.json     ({ tracks: TrackMeta[] })
 *   GET /tracks/:id      → data/catalog/track/<id>.json (TrackMeta)
 * Re-run after editing data/catalog/manifest.json.
 */
const catalogDir = resolve(dirname(fileURLToPath(import.meta.url)), "../data/catalog");
const trackDir = resolve(catalogDir, "track");

const tracks = tracksWithAssets().map(toTrackMeta);

writeFileSync(resolve(catalogDir, "tracks.json"), JSON.stringify({ tracks }));

rmSync(trackDir, { recursive: true, force: true });
mkdirSync(trackDir, { recursive: true });
for (const t of tracks) {
  writeFileSync(resolve(trackDir, `${t.id}.json`), JSON.stringify(t));
}

console.log(`export-catalog: wrote ${tracks.length} tracks → ${catalogDir}`);
