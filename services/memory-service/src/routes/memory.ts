import type { FastifyInstance } from "fastify";
import type { MemoryClient } from "../memory/client.js";

export function registerMemoryRoutes(app: FastifyInstance, memory: MemoryClient): void {
  app.post("/memory/recall", async (req, reply) => {
    const { query, user_id } = (req.body ?? {}) as { query?: string; user_id?: string };
    if (!query || !user_id) return reply.code(400).send({ error: "query and user_id are required" });
    return { memories: await memory.recall(query, user_id) };
  });

  app.post("/memory/recall-intent", async (req, reply) => {
    const { user_id, mood, scene } = (req.body ?? {}) as { user_id?: string; mood?: string; scene?: string };
    if (!user_id || !mood || !scene) return reply.code(400).send({ error: "user_id, mood, and scene are required" });
    return { memories: await memory.recallForIntent(user_id, mood, scene) };
  });

  app.post("/memory/remember", async (req, reply) => {
    const { fact, session_id, user_id } = (req.body ?? {}) as { fact?: string; session_id?: string; user_id?: string };
    if (!fact || !session_id || !user_id) {
      return reply.code(400).send({ error: "fact, session_id, and user_id are required" });
    }
    await memory.remember(fact, session_id, user_id);
    return { ok: true };
  });
}
