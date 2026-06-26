import type { FastifyInstance } from "fastify";
import { parseBearerToken, type TasteProfileResponse } from "@auracle/shared";
import type { AuthStore } from "../auth-store.js";
import type { CatalogIndex } from "../catalog-index.js";
import type { MemoryClient } from "../memory/client.js";
import type { TasteStore } from "../taste/taste-store.js";
import { findInvalidPreferences, parseSaveTasteRequest, resolvePreferences, summarizeTaste } from "../taste/taste.js";

interface TasteRouteDeps {
  auth: AuthStore;
  taste: TasteStore;
  memory: MemoryClient;
  catalog: CatalogIndex;
}

/** Pseudo run id for mem0 facts written from a taste save (not a live session). */
const TASTE_RUN_ID = "taste-profile";

export function registerTasteRoutes(app: FastifyInstance, deps: TasteRouteDeps): void {
  const { auth, taste, memory, catalog } = deps;

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

    // PUT replaces the profile, so replace the prior human-readable mem0 taste fact too.
    await memory.forget(TASTE_RUN_ID, user.id);
    const summary = summarizeTaste(parsed.preferences, catalog, parsed.freeText);
    if (summary) await memory.remember(summary, TASTE_RUN_ID, user.id);

    const body: TasteProfileResponse = {
      preferences: resolvePreferences(parsed.preferences, catalog),
      ...(parsed.freeText ? { freeText: parsed.freeText } : {}),
      catalogRevisionAtSave: catalog.revision,
      catalogRevision: catalog.revision,
    };
    return body;
  });

  // Internal: a user's active catalog-resolvable prefs for plan weighting (S4).
  app.post("/taste/weights", async (req, reply) => {
    const { user_id } = (req.body ?? {}) as { user_id?: string };
    if (!user_id) return reply.code(400).send({ error: "user_id is required" });
    const resolved = resolvePreferences(taste.getProfile(user_id).preferences, catalog);
    return { preferences: resolved.filter((p) => p.status === "active") };
  });
}
