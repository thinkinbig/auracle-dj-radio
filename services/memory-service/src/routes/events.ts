import type { FastifyInstance } from "fastify";
import type { EventsDb } from "../events-db.js";

export function registerEventRoutes(app: FastifyInstance, events: EventsDb): void {
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

  // Internal: read events for offline eval scripts (#66 — feedback timeline,
  // played_track_ids reconstruction, #68 metrics). At least one filter required.
  app.post("/events/query", async (req, reply) => {
    const { session_id, user_id, event_type, limit } = (req.body ?? {}) as {
      session_id?: string;
      user_id?: string;
      event_type?: string;
      limit?: number;
    };
    if (!session_id && !user_id) {
      return reply.code(400).send({ error: "session_id or user_id is required" });
    }
    return {
      events: events.queryEvents({
        sessionId: session_id,
        userId: user_id,
        eventType: event_type,
        limit: typeof limit === "number" ? limit : undefined,
      }),
    };
  });

  app.post("/events/skip-rate-by-energy", async (req, reply) => {
    const { user_id, recent_sessions } = (req.body ?? {}) as { user_id?: string; recent_sessions?: number };
    if (!user_id) return reply.code(400).send({ error: "user_id is required" });
    const limit = typeof recent_sessions === "number" && recent_sessions > 0 ? recent_sessions : 10;
    return { weights: events.skipRateByEnergy(user_id, limit) };
  });
}
