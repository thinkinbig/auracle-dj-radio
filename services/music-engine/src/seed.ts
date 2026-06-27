import { config } from "./config.js";
import { CatalogDb, type TrackRow } from "./catalog-db.js";
import { resolveCatalogPath, tracksWithAssets, writeCatalogRevision } from "./catalog/manifest.js";

/** Build the catalog SQLite from `<catalogDataDir>/catalog/manifest.json`. */
async function main(): Promise<void> {
  const db = new CatalogDb(config.dbPath);
  const tracks = tracksWithAssets();

  for (const track of tracks) {
    const row: TrackRow = {
      ...track,
      filePath: resolveCatalogPath(track.filePath),
      albumCoverPath: resolveCatalogPath(track.albumCoverPath),
      artistPhotoPath: resolveCatalogPath(track.artistPhotoPath),
    };
    db.upsertTrack(row);
  }
  db.close();
  const revision = writeCatalogRevision();
  console.log(`Seeded ${tracks.length} tracks into ${config.dbPath} (catalog revision ${revision})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
