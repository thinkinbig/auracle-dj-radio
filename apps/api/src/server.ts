import Fastify, { type FastifyInstance } from "fastify";
import type { ApiContext } from "./context.js";
import { registerRoutes } from "./routes/sessions.js";

export function buildServer(ctx: ApiContext): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ ok: true }));
  registerRoutes(app, ctx);
  return app;
}
