import Fastify, { type FastifyInstance } from "fastify";
import type { AuthStore } from "./auth-store.js";
import type { CatalogIndex } from "./catalog-index.js";
import type { EventsDb } from "./events-db.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerTasteRoutes } from "./routes/taste.js";

export interface ProfileServiceDeps {
  events: EventsDb;
  auth: AuthStore;
  /** Live catalog (S1) for deriving session feedback entities. */
  catalog: CatalogIndex;
}

/** Service for auth, analytics events, and session feedback derivation. */
export function buildServer(deps: ProfileServiceDeps): FastifyInstance {
  const { events, auth, catalog } = deps;
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, profile: { auth: true, events: true } }));

  registerEventRoutes(app, events);
  registerAuthRoutes(app, auth);
  registerTasteRoutes(app, { catalog });

  return app;
}
