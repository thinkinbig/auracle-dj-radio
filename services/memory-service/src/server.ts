import Fastify, { type FastifyInstance } from "fastify";
import type { AuthStore } from "./auth-store.js";
import type { CatalogIndex } from "./catalog-index.js";
import type { EventsDb } from "./events-db.js";
import type { MemoryClient } from "./memory/client.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerMemoryRoutes } from "./routes/memory.js";
import { registerTasteRoutes } from "./routes/taste.js";
import type { TasteStore } from "./taste/taste-store.js";

export interface MemoryServiceDeps {
  events: EventsDb;
  memory: MemoryClient;
  auth: AuthStore;
  taste: TasteStore;
  /** Live catalog (S1) for validating/resolving taste entities. */
  catalog: CatalogIndex;
}

/** Memory-service owns auth, cross-session memory, analytics events, and taste. */
export function buildServer(deps: MemoryServiceDeps): FastifyInstance {
  const { events, memory, auth, taste, catalog } = deps;
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, memory: { enabled: memory.enabled, degraded: memory.degraded } }));

  registerMemoryRoutes(app, memory);
  registerEventRoutes(app, events);
  registerAuthRoutes(app, auth);
  registerTasteRoutes(app, { auth, taste, memory, catalog });

  return app;
}
