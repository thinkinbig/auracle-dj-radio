import Fastify, { type FastifyInstance } from "fastify";
import { CatalogDb } from "./catalog-db.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerPlanningRoutes } from "./routes/planning.js";
import type { PlanDeps } from "./flow/plan.js";

export interface MusicEngine {
  app: FastifyInstance;
  db: CatalogDb;
}

/**
 * Build the music-engine HTTP service: stateless catalog retrieval + tracklist
 * planning over an owned catalog DB. Consumed by agent-harness.
 */
export function buildServer(dbPath: string): MusicEngine {
  const db = new CatalogDb(dbPath);
  const deps: PlanDeps = {
    tracks: () => db.allTracks(),
  };

  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, tracks: db.allTracks().length }));
  registerCatalogRoutes(app, db);
  registerPlanningRoutes(app, deps);

  return { app, db };
}
