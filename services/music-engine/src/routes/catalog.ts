import type { FastifyInstance } from "fastify";
import type { GenreCount } from "@auracle/shared";
import type { Catalog } from "../catalog-store.js";
import { computeCatalogRevision, loadGenreTaxonomy } from "../catalog/manifest.js";

export function registerCatalogRoutes(app: FastifyInstance, db: Catalog): void {
  // Taxonomy slugs + per-genre track counts for the taste-onboarding UI (S3).
  app.get("/catalog/genres", async () => {
    const taxonomy = loadGenreTaxonomy();
    const counts = new Map<string, number>();
    for (const t of db.allTracks()) counts.set(t.genreSlug, (counts.get(t.genreSlug) ?? 0) + 1);
    const genres: GenreCount[] = taxonomy.genres.map((g) => ({ ...g, count: counts.get(g.slug) ?? 0 }));
    return { genres, revision: computeCatalogRevision() };
  });

  // Catalog metadata for cue building (agent-harness prefetches per session).
  app.get("/tracks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const meta = db.getTrackMeta(id);
    if (!meta) return reply.code(404).send({ error: "track not found" });
    return meta;
  });
}
