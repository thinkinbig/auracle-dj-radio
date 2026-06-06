import type { TrackCandidate } from "@auracle/shared";
import { toCandidate } from "@auracle/shared";
import type { TrackRow } from "../db/index.js";
import type { Embedder } from "./embedder.js";
import { queryTagText } from "./embedder.js";
import { topK } from "./cosine.js";

export interface RetrieveInput {
  mood: string;
  scene: string;
  excludeIds?: Set<string>;
  limit?: number;
}

/** Step 1 — embed the mood/scene query and return the top-K candidate tracks by cosine. */
export async function retrieveCandidates(
  embedder: Embedder,
  tracks: TrackRow[],
  input: RetrieveInput,
): Promise<TrackCandidate[]> {
  const query = await embedder.embed(queryTagText(input.mood, input.scene));
  const pool = input.excludeIds ? tracks.filter((t) => !input.excludeIds!.has(t.id)) : tracks;
  const ranked = topK(query, pool, (t) => t.embedding, input.limit ?? 24);
  return ranked.map((s) => toCandidate(s.item));
}
