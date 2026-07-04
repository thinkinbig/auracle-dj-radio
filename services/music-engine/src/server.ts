import Fastify, { type FastifyInstance } from "fastify";
import { Catalog } from "./catalog-store.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerPlanningRoutes } from "./routes/planning.js";
import type { PlanDeps } from "./flow/plan.js";
import { resolveSeeds } from "./flow/resolve-seeds.js";

export interface MusicEngine {
  app: FastifyInstance;
  catalog: Catalog;
}

/**
 * Build the music-engine HTTP service: stateless catalog retrieval + tracklist
 * planning over an in-memory catalog loaded from the manifest. Consumed by
 * agent-harness.
 */
export function buildServer(catalog: Catalog): MusicEngine {
  const deps: PlanDeps = {
    tracks: () => catalog.allTracks(),
    resolveSeeds,
  };

  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, tracks: catalog.allTracks().length }));
  registerCatalogRoutes(app, catalog);
  registerPlanningRoutes(app, deps);

  return { app, catalog };
}
