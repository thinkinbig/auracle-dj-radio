import type { FastifyInstance } from "fastify";
import type { CatalogIndex } from "../catalog-index.js";
import { feedbackPreferences, parseSessionFeedback } from "../taste/taste.js";

interface TasteRouteDeps {
  catalog: CatalogIndex;
}

export function registerTasteRoutes(app: FastifyInstance, deps: TasteRouteDeps): void {
  const { catalog } = deps;

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
    };
    const feedback = parseSessionFeedback(body.feedback);
    if (!body.user_id || !body.session_id || !body.track_id || !feedback) {
      return reply.code(400).send({ error: "user_id, session_id, track_id and feedback (like|dislike) are required" });
    }

    const derived = feedbackPreferences(body.track_id, feedback, catalog);
    return { preferences: derived };
  });
}
