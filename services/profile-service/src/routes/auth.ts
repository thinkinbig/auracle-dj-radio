import type { FastifyInstance } from "fastify";
import { parseBearerToken } from "@auracle/shared";
import { AuthConfigurationError, type AuthStore } from "../auth-store.js";

export function registerAuthRoutes(app: FastifyInstance, auth: AuthStore): void {
  app.post("/auth/register", async (_req, reply) => {
    return reply.code(410).send({ error: "password registration has moved to Supabase Auth" });
  });

  app.post("/auth/login", async (_req, reply) => {
    return reply.code(410).send({ error: "password login has moved to Supabase Auth" });
  });

  app.get("/auth/me", async (req, reply) => {
    let user;
    try {
      user = await auth.getUserByToken(parseBearerToken(req.headers.authorization));
    } catch (err) {
      if (err instanceof AuthConfigurationError) {
        return reply.code(503).send({ error: "Supabase auth is not configured" });
      }
      throw err;
    }
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    return { user };
  });

  app.post("/auth/logout", async () => {
    return { ok: true };
  });
}
