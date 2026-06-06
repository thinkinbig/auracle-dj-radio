import { existsSync, createReadStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { ApiContext } from "./context.js";
import { geminiCircuitStats } from "./gemini/guard.js";
import { registerRoutes } from "./routes/sessions.js";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildServer(ctx: ApiContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(websocket);
  app.get("/health", async () => ({
    ok: true,
    gemini_cb: geminiCircuitStats(),
  }));

  app.get("/covers/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    if (file.includes("..") || file.includes("/")) {
      return reply.code(400).send({ error: "invalid cover path" });
    }
    const path = resolve(apiRoot, "data/covers", file);
    if (!existsSync(path)) return reply.code(404).send({ error: "cover not found" });
    reply.header("cache-control", "public, max-age=31536000, immutable");
    const mime = file.endsWith(".svg")
      ? "image/svg+xml"
      : file.endsWith(".png")
        ? "image/png"
        : file.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
    return reply.type(mime).send(createReadStream(path));
  });

  app.get("/artists/:file", async (req, reply) => {
    const { file } = req.params as { file: string };
    if (file.includes("..") || file.includes("/")) {
      return reply.code(400).send({ error: "invalid artist photo path" });
    }
    const path = resolve(apiRoot, "data/artists", file);
    if (!existsSync(path)) return reply.code(404).send({ error: "artist photo not found" });
    reply.header("cache-control", "public, max-age=31536000, immutable");
    const mime = file.endsWith(".png")
      ? "image/png"
      : file.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return reply.type(mime).send(createReadStream(path));
  });

  registerRoutes(app, ctx);
  return app;
}
