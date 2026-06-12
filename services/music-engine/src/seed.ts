import { config } from "./config.js";
import { CatalogDb, type TrackRow } from "./catalog-db.js";
import { resolveCatalogPath, tracksWithAssets } from "./catalog/manifest.js";
import { buildEmbedder } from "./wiring.js";

/**
 * Build the catalog SQLite from `<catalogDataDir>/catalog/manifest.json`.
 * Phase 1 uses the offline HashEmbedder (metadata text → vector), so no audio
 * file reads are needed.
 */
async function main(): Promise<void> {
  const db = new CatalogDb(config.dbPath);
  const embedder = buildEmbedder();
  const tracks = tracksWithAssets();

  for (const track of tracks) {
    const filePath = resolveCatalogPath(track.filePath);
    const embedding = await embedder.embedTrack({ ...track, filePath });
    const row: TrackRow = {
      ...track,
      filePath,
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
