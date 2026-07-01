import type { FastifyInstance } from "fastify";
import type { MemoryServiceClient } from "@auracle/clients";
import type { SessionRuntime } from "../session/runtime.js";
import { createSessionRouteMiddleware } from "./session-route-middleware.js";

interface SessionRouteDeps {
  harness: SessionRuntime;
  memory: MemoryServiceClient;
}

export function registerSessionRoutes(app: FastifyInstance, deps: SessionRouteDeps): void {
  const { harness } = deps;
  const sessionRoute = createSessionRouteMiddleware(deps);

  app.post("/sessions", async (req, reply) => {
    return sessionRoute.create(req, reply, ({ intent, userId }) => harness.createSession(intent, userId));
  });

  app.get("/sessions/:id/registration", async (req, reply) => {
    return sessionRoute.read(req, reply, (id) => harness.registration(id));
  });

  app.get("/sessions/:id", async (req, reply) => {
    return sessionRoute.read(req, reply, (id) => harness.sessionSnapshot(id));
  });

  app.post("/sessions/:id/tool", async (req, reply) => {
    return sessionRoute.tool(req, reply, ({ id, call }) => harness.runTool(id, call));
  });

  app.post("/sessions/:id/skip-track", async (req, reply) => {
    return sessionRoute.ownedOk<{ track_id?: string }>(req, reply, ({ id, body }) =>
      harness.skipTrack(id, body.track_id),
    );
  });

  app.post("/sessions/:id/now_playing", async (req, reply) => {
    return sessionRoute.owned<{ track_id?: string }>(req, reply, async ({ id, body }) => {
      if (!body.track_id) return reply.code(400).send({ error: "track_id is required" });
      const result = await harness.markNowPlaying(id, body.track_id);
      if (result === false) return reply.code(400).send({ error: "unknown track_id" });
      return result;
    });
  });

  app.post("/sessions/:id/cue", async (req, reply) => {
    return sessionRoute.ownedOk<{ kind?: string }>(req, reply, ({ id, body }) => harness.cue(id, body.kind === "outro" ? "outro" : "break"));
  });

  app.post("/sessions/:id/host-mode", async (req, reply) => {
    return sessionRoute.owned<{ host_mode?: unknown }>(req, reply, async ({ id, body }) => {
      const result = await harness.changeHostMode(id, body.host_mode);
      if (result === false) return reply.code(400).send({ error: "host_mode is required" });
      return result;
    });
  });

  app.post("/sessions/:id/playlist-feedback", async (req, reply) => {
    return sessionRoute.owned<{ feedback?: unknown }>(req, reply, async ({ id, body }) => {
      const result = await harness.playlistFeedback(id, body.feedback);
      if (result === undefined) return undefined;
      if (result === false) return reply.code(400).send({ error: "feedback must be like, dislike, or regenerate" });
      return {
        ok: true,
        feedback: body.feedback,
        ...(result.regenerate ? { regenerate: result.regenerate } : {}),
      };
    });
  });

  app.post("/sessions/:id/extend", async (req, reply) => {
    return sessionRoute.ownedOk<unknown>(req, reply, ({ id }) => harness.retryExtend(id));
  });

  app.post("/sessions/:id/events", async (req, reply) => {
    return sessionRoute.owned<{ event_type?: string; payload?: unknown }>(req, reply, async ({ id, body }) => {
      if (!body.event_type) return reply.code(400).send({ error: "event_type is required" });
      const ok = await harness.recordClientEvent(id, body.event_type, body.payload ?? {});
      if (!ok) return reply.code(404).send({ error: "session not found" });
      return { ok: true };
    });
  });
}
