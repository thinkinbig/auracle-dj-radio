import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { ApiContext } from "./context.js";
import { geminiCircuitStats } from "./gemini/guard.js";
import { registerRoutes } from "./routes/sessions.js";

export async function buildServer(ctx: ApiContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(websocket);
  app.get("/health", async () => ({
    ok: true,
    gemini_cb: geminiCircuitStats(),
  }));
  registerRoutes(app, ctx);
  return app;
}
