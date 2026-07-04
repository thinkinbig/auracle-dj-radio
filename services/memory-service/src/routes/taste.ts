import type { FastifyInstance } from "fastify";
import { ANONYMOUS_USER_ID, parseBearerToken, type TasteProfileResponse } from "@auracle/shared";
import type { AuthStore } from "../auth-store.js";
import type { CatalogIndex } from "../catalog-index.js";
import type { TasteStore } from "../taste/taste-store.js";
import {
  feedbackPreferences,
  findInvalidPreferences,
  parseSaveTasteRequest,
  parseSessionFeedback,
  resolvePreferences,
} from "../taste/taste.js";

interface TasteRouteDeps {
  auth: AuthStore;
  taste: TasteStore;
  catalog: CatalogIndex;
}

export function registerTasteRoutes(app: FastifyInstance, deps: TasteRouteDeps): void {
  const { auth, taste, catalog } = deps;

  // Structured taste profile (Epic #3, S2). Login required; no taste
  // persistence for the anonymous identity (design §8).
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

    const invalid = findInvalidPreferences(parsed.preferences, catalog);
    if (invalid.length > 0) {
      return reply.code(400).send({
        error: "unknown taste entities",
        invalid: invalid.map((p) => ({ entityType: p.entityType, entityId: p.entityId })),
      });
    }

    taste.saveProfile(user.id, parsed.preferences, parsed.freeText, catalog.revision);

    const body: TasteProfileResponse = {
      preferences: resolvePreferences(parsed.preferences, catalog),
      ...(parsed.freeText ? { freeText: parsed.freeText } : {}),
      catalogRevisionAtSave: catalog.revision,
      catalogRevision: catalog.revision,
    };
    return body;
  });

  // Internal: like/dislike on the playing track -> session-sourced taste (#69).
  // Always returns the derived prefs so agent-harness can nudge the in-session
  // queue (#68). Cross-session persistence is retired; Spotify owns long-term
  // taste.
  app.post("/taste/session-feedback", async (req, reply) => {
    const body = (req.body ?? {}) as {
      user_id?: string;
      session_id?: string;
      track_id?: string;
      feedback?: string;
      persist?: boolean;
    };
    const feedback = parseSessionFeedback(body.feedback);
    if (!body.user_id || !body.session_id || !body.track_id || !feedback) {
      return reply.code(400).send({ error: "user_id, session_id, track_id and feedback (like|dislike) are required" });
    }

    const derived = feedbackPreferences(body.track_id, feedback, catalog);
    return { preferences: derived, persisted: false, retired: body.persist === true && body.user_id !== ANONYMOUS_USER_ID };
  });
}
