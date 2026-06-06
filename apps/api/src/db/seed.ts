import { config } from "../config.js";
import { Db, type TrackRow } from "./index.js";
import { SEED_TRACKS } from "./seed-data.js";
import { selectEmbedder } from "../context.js";

/**
 * Build the SQLite library. Embeddings are precomputed offline (doc §Step 1)
 * with the SAME embedder the server uses at query time (AURACLE_EMBEDDER):
 * HashEmbedder (768-dim, no key) by default, or gemini-embedding-001 (3072-dim).
 * Re-run after changing the embedder — switching models requires a full rebuild,
 * since hash- and gemini-space vectors are not comparable.
 */
async function main(): Promise<void> {
  const db = new Db(config.dbPath);
  const embedder = await selectEmbedder();
  for (const track of SEED_TRACKS) {
    const embedding = await embedder.embedTrack(track);
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
