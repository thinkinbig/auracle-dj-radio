import { config } from "../config.js";
import { Db, type TrackRow } from "./index.js";
import { SEED_TRACKS } from "./seed-data.js";
import { HashEmbedder, trackTagText } from "../flow/embedder.js";

/**
 * Build the SQLite library. Embeddings are precomputed offline (doc §Step 1):
 * here with the deterministic HashEmbedder so the demo runs without a key.
 * Re-run after changing the embedder — switching models requires a full rebuild.
 */
async function main(): Promise<void> {
  const db = new Db(config.dbPath);
  const embedder = new HashEmbedder();
  for (const track of SEED_TRACKS) {
    const embedding = await embedder.embed(trackTagText(track));
    const row: TrackRow = { ...track, embedding };
    db.upsertTrack(row);
  }
  db.close();
  console.log(`Seeded ${SEED_TRACKS.length} tracks into ${config.dbPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
