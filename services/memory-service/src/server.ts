import Fastify, { type FastifyInstance } from "fastify";
import type { AuthStore } from "./auth-store.js";
import type { CatalogIndex } from "./catalog-index.js";
import type { EventsDb } from "./events-db.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerTasteRoutes } from "./routes/taste.js";
import type { TasteStore } from "./taste/taste-store.js";

export interface MemoryServiceDeps {
  events: EventsDb;
  auth: AuthStore;
  taste: TasteStore;
  /** Live catalog (S1) for validating/resolving taste entities. */
  catalog: CatalogIndex;
}

/** Compatibility service for auth, analytics events, and legacy taste profile endpoints. */
export function buildServer(deps: MemoryServiceDeps): FastifyInstance {
  const { events, auth, taste, catalog } = deps;
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, memory: { enabled: false, degraded: false, retired: true } }));

  registerEventRoutes(app, events);
  registerAuthRoutes(app, auth);
  registerTasteRoutes(app, { auth, taste, catalog });

  return app;
}
