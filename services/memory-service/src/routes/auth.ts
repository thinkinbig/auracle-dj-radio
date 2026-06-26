import type { FastifyInstance } from "fastify";
import { parseBearerToken, type AuthCredentials, type RegisterCredentials } from "@auracle/shared";
import type { AuthStore } from "../auth-store.js";

function parseCredentials(raw: unknown): AuthCredentials | undefined {
  const body = (raw ?? {}) as Partial<AuthCredentials>;
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password || password.length < 6) return undefined;
  return { email, password };
}

export function registerAuthRoutes(app: FastifyInstance, auth: AuthStore): void {
  app.post("/auth/register", async (req, reply) => {
    const credentials = parseCredentials(req.body);
    if (!credentials) return reply.code(400).send({ error: "valid email and password are required" });
    const { name } = (req.body ?? {}) as Partial<RegisterCredentials>;
    const user = await auth.createUser({ ...credentials, name });
    if (!user) return reply.code(409).send({ error: "email already registered" });
    return { user, token: auth.createSession(user.id) };
  });

  app.post("/auth/login", async (req, reply) => {
    const credentials = parseCredentials(req.body);
    if (!credentials) return reply.code(400).send({ error: "valid email and password are required" });
    const user = await auth.verifyUser(credentials.email, credentials.password);
    if (!user) return reply.code(401).send({ error: "invalid email or password" });
    return { user, token: auth.createSession(user.id) };
  });

  app.get("/auth/me", async (req, reply) => {
    const user = auth.getUserByToken(parseBearerToken(req.headers.authorization));
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    return { user };
  });

  app.post("/auth/logout", async (req) => {
    auth.deleteSession(parseBearerToken(req.headers.authorization));
    return { ok: true };
  });
}
