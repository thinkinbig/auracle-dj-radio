import Fastify, { type FastifyInstance } from "fastify";
import {
  parseBearerToken,
  type AuthCredentials,
  type RegisterCredentials,
  type TasteProfileResponse,
} from "@auracle/shared";
import type { AuthStore } from "./auth-store.js";
import type { CatalogIndex } from "./catalog-index.js";
import type { EventsDb } from "./events-db.js";
import type { MemoryClient } from "./memory/client.js";
import type { TasteStore } from "./taste-store.js";
import { findInvalidPreferences, parseSaveTasteRequest, resolvePreferences, summarizeTaste } from "./taste.js";

export interface MemoryServiceDeps {
  events: EventsDb;
  memory: MemoryClient;
  auth: AuthStore;
  taste: TasteStore;
  /** Live catalog (S1) for validating/resolving taste entities. */
  catalog: CatalogIndex;
}

/** Pseudo run id for mem0 facts written from a taste save (not a live session). */
const TASTE_RUN_ID = "taste-profile";

function parseCredentials(raw: unknown): AuthCredentials | undefined {
  const body = (raw ?? {}) as Partial<AuthCredentials>;
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password || password.length < 6) return undefined;
  return { email, password };
}

/** Memory-service owns auth, cross-session memory, analytics events, and taste. */
export function buildServer(deps: MemoryServiceDeps): FastifyInstance {
  const { events, memory, auth, taste, catalog } = deps;
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.post("/memory/recall", async (req, reply) => {
    const { query, user_id } = (req.body ?? {}) as { query?: string; user_id?: string };
    if (!query || !user_id) return reply.code(400).send({ error: "query and user_id are required" });
    return { memories: await memory.recall(query, user_id) };
  });

  app.post("/memory/remember", async (req, reply) => {
    const { fact, session_id, user_id } = (req.body ?? {}) as { fact?: string; session_id?: string; user_id?: string };
    if (!fact || !session_id || !user_id) {
      return reply.code(400).send({ error: "fact, session_id, and user_id are required" });
    }
    await memory.remember(fact, session_id, user_id);
    return { ok: true };
  });

  app.post("/events", async (req, reply) => {
    const { session_id, user_id, event_type, payload } = (req.body ?? {}) as {
      session_id?: string;
      user_id?: string;
      event_type?: string;
      payload?: unknown;
    };
    if (!session_id || !user_id || !event_type) {
      return reply.code(400).send({ error: "session_id, user_id, and event_type are required" });
    }
    events.recordEvent(session_id, user_id, event_type, payload ?? {});
    return { ok: true };
  });

  app.post("/events/skip-rate-by-energy", async (req, reply) => {
    const { user_id, recent_sessions } = (req.body ?? {}) as { user_id?: string; recent_sessions?: number };
    if (!user_id) return reply.code(400).send({ error: "user_id is required" });
    const limit = typeof recent_sessions === "number" && recent_sessions > 0 ? recent_sessions : 10;
    return { weights: events.skipRateByEnergy(user_id, limit) };
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
    const user = auth.getUserByToken(parseBearerToken(req.headers.authorization));
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    return { user };
  });

  app.post("/auth/logout", async (req) => {
    auth.deleteSession(parseBearerToken(req.headers.authorization));
    return { ok: true };
  });

  // --- Structured taste profile (Epic #3, S2). Login required; no taste
  //     persistence for the anonymous identity (design §8). ---

  app.get("/users/me/taste", async (req, reply) => {
    const user = auth.getUserByToken(parseBearerToken(req.headers.authorization));
    if (!user) return reply.code(401).send({ error: "authentication required" });
    const profile = taste.getProfile(user.id);
    const body: TasteProfileResponse = {
      ...profile,
      preferences: resolvePreferences(profile.preferences, catalog),
      catalogRevision: catalog.revision,
    };
    return body;
  });

  app.put("/users/me/taste", async (req, reply) => {
    const user = auth.getUserByToken(parseBearerToken(req.headers.authorization));
    if (!user) return reply.code(401).send({ error: "authentication required" });

    const parsed = parseSaveTasteRequest(req.body);
    if ("error" in parsed) return reply.code(400).send({ error: parsed.error });

    // Every entity must resolve against the live catalog (S1).
    const invalid = findInvalidPreferences(parsed.preferences, catalog);
    if (invalid.length > 0) {
      return reply.code(400).send({
        error: "unknown taste entities",
        invalid: invalid.map((p) => ({ entityType: p.entityType, entityId: p.entityId })),
      });
    }

    taste.saveProfile(user.id, parsed.preferences, parsed.freeText, catalog.revision);

    // Dual-write a human-readable summary fact for DJ recall (§3, mem0 layer).
    const summary = summarizeTaste(parsed.preferences, parsed.freeText);
    if (summary) await memory.remember(summary, TASTE_RUN_ID, user.id);

    const body: TasteProfileResponse = {
      preferences: resolvePreferences(parsed.preferences, catalog),
      ...(parsed.freeText ? { freeText: parsed.freeText } : {}),
      catalogRevisionAtSave: catalog.revision,
      catalogRevision: catalog.revision,
    };
    return body;
  });

  return app;
}
