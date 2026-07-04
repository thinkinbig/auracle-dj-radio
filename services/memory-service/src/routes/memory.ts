import type { FastifyInstance } from "fastify";

const RETIRED = "Auracle-owned long-term memory is retired; Spotify owns cross-session taste.";

export function registerMemoryRoutes(app: FastifyInstance): void {
  app.post("/memory/recall", async (req, reply) => {
    const { query, user_id } = (req.body ?? {}) as { query?: string; user_id?: string };
    if (!query || !user_id) return reply.code(400).send({ error: "query and user_id are required" });
    return { memories: "", retired: true, message: RETIRED };
  });

  app.post("/memory/recall-intent", async (req, reply) => {
    const { user_id, mood, scene } = (req.body ?? {}) as { user_id?: string; mood?: string; scene?: string };
    if (!user_id || !mood || !scene) return reply.code(400).send({ error: "user_id, mood, and scene are required" });
    return { memories: "", retired: true, message: RETIRED };
  });

  app.post("/memory/remember", async (req, reply) => {
    const { fact, session_id, user_id } = (req.body ?? {}) as { fact?: string; session_id?: string; user_id?: string };
    if (!fact || !session_id || !user_id) {
      return reply.code(400).send({ error: "fact, session_id, and user_id are required" });
    }
    return reply.code(410).send({ ok: false, retired: true, message: RETIRED });
  });
}
