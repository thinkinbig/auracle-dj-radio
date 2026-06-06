import { config } from "../config.js";
import { Db, type TrackRow } from "./index.js";
import { loadSeedTracks } from "./seed-data.js";
import { resolveCatalogPath } from "../catalog/manifest.js";
import { buildSeedEmbedder } from "../gemini/wiring.js";

/**
 * Build the SQLite library from `data/catalog/manifest.json`.
 * Embeddings use rich text (artist + album + tags + lore) — ADR-0002 Phase 1.
 */
async function main(): Promise<void> {
  const db = new Db(config.dbPath);
  const embedder = await buildSeedEmbedder();
  const tracks = loadSeedTracks();

  for (const track of tracks) {
    const embedding = await embedder.embedTrack(track);
    const row: TrackRow = {
      ...track,
      filePath: resolveCatalogPath(track.filePath),
      albumCoverPath: resolveCatalogPath(track.albumCoverPath),
      artistPhotoPath: resolveCatalogPath(track.artistPhotoPath),
      embedding,
    };
    db.upsertTrack(row);
  }
  db.close();
  console.log(`Seeded ${tracks.length} tracks into ${config.dbPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
