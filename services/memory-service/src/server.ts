import Fastify, { type FastifyInstance } from "fastify";
import type { AuthCredentials, RegisterCredentials } from "@auracle/shared";
import type { AuthStore } from "./auth-store.js";
import type { EventsDb } from "./events-db.js";
import type { MemoryClient } from "./memory/client.js";

export interface MemoryServiceDeps {
  events: EventsDb;
  memory: MemoryClient;
  auth: AuthStore;
}

function bearerToken(raw: string | undefined): string | undefined {
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function parseCredentials(raw: unknown): AuthCredentials | undefined {
  const body = (raw ?? {}) as Partial<AuthCredentials>;
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password || password.length < 6) return undefined;
  return { email, password };
}

/** Memory-service owns auth, cross-session memory, and analytics events. */
export function buildServer(deps: MemoryServiceDeps): FastifyInstance {
  const { events, memory, auth } = deps;
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.post("/memory/recall", async (req, reply) => {
    const { query } = (req.body ?? {}) as { query?: string };
    if (!query) return reply.code(400).send({ error: "query is required" });
    return { memories: await memory.recall(query) };
  });

  app.post("/memory/remember", async (req, reply) => {
    const { fact, session_id } = (req.body ?? {}) as { fact?: string; session_id?: string };
    if (!fact || !session_id) return reply.code(400).send({ error: "fact and session_id are required" });
    await memory.remember(fact, session_id);
    return { ok: true };
  });

  app.post("/events", async (req, reply) => {
    const { session_id, event_type, payload } = (req.body ?? {}) as {
      session_id?: string;
      event_type?: string;
      payload?: unknown;
    };
    if (!session_id || !event_type) return reply.code(400).send({ error: "session_id and event_type are required" });
    events.recordEvent(session_id, event_type, payload ?? {});
    return { ok: true };
  });

  app.post("/events/skip-rate-by-energy", async (req) => {
    const { recent_sessions } = (req.body ?? {}) as { recent_sessions?: number };
    const limit = Number.isInteger(recent_sessions) && (recent_sessions as number) > 0 ? (recent_sessions as number) : 10;
    return { weights: events.skipRateByEnergy(limit) };
  });

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
    const user = auth.getUserByToken(bearerToken(req.headers.authorization));
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    return { user };
  });

  app.post("/auth/logout", async (req) => {
    auth.deleteSession(bearerToken(req.headers.authorization));
    return { ok: true };
  });

  return app;
}
