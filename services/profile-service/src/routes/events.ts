import type { FastifyInstance } from "fastify";
import type { EventsStore } from "../events-db.js";

export function registerEventRoutes(app: FastifyInstance, events: EventsStore): void {
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
    try {
      await events.recordEvent(session_id, user_id, event_type, payload ?? {});
    } catch (error) {
      req.log.error({ err: error, session_id, user_id, event_type }, "failed to record session event");
      return reply.code(500).send({ error: "failed to record event" });
    }
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
    try {
      return {
        events: await events.queryEvents({
          sessionId: session_id,
          userId: user_id,
          eventType: event_type,
          limit: typeof limit === "number" ? limit : undefined,
        }),
      };
    } catch (error) {
      req.log.error({ err: error, session_id, user_id, event_type }, "failed to query session events");
      return reply.code(500).send({ error: "failed to query events" });
    }
  });
}
