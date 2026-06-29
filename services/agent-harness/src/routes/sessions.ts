import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ANONYMOUS_USER_ID, parseBearerToken, type Condition, type SessionIntent } from "@auracle/shared";
import type { AgentHarness } from "../harness/agent-harness.js";
import type { MemoryServiceClient } from "../memory-service-client.js";
import type { ToolCall } from "../session/tool-runner.js";

interface SessionRouteDeps {
  harness: AgentHarness;
  memory: MemoryServiceClient;
}

export function registerSessionRoutes(app: FastifyInstance, deps: SessionRouteDeps): void {
  const { harness, memory } = deps;

  /**
   * Ownership guard for client-facing /sessions/:id/* routes (issue #55). A
   * session bound to an authenticated user may only be operated by that user's
   * Bearer token. Guest sessions (anonymous owner) carry no binding and stay
   * open. A superseded id answers 410 Gone so the old device gets a clear
   * signal; an unknown id stays 404. Returns false (and sends the reply) when
   * the caller is not allowed; the internal proxy→harness /tool path is exempt.
   */
  async function ensureOwner(req: FastifyRequest, reply: FastifyReply, id: string): Promise<boolean> {
    const owner = harness.sessionOwner(id);
    if (owner === undefined) {
      const reason = harness.invalidationReason(id);
      if (reason) reply.code(410).send({ error: "session superseded", reason });
      else reply.code(404).send({ error: "session not found" });
      return false;
    }
    if (owner === ANONYMOUS_USER_ID) return true;
    const token = parseBearerToken(req.headers.authorization);
    const resolved = await memory.resolveSessionUser(token);
    if (resolved.kind !== "authenticated" || resolved.userId !== owner) {
      reply.code(403).send({ error: "forbidden" });
      return false;
    }
    return true;
  }

  app.post("/sessions", async (req, reply) => {
    const body = (req.body ?? {}) as Partial<SessionIntent> & { condition?: Condition };
    if (!harness.parseSessionIntent(body)) return reply.code(400).send({ error: "mood and scene are required" });
    const token = parseBearerToken(req.headers.authorization);
    const resolved = await memory.resolveSessionUser(token);
    if (resolved.kind === "invalid_token") {
      return reply.code(401).send({ error: "invalid or expired token" });
    }
    return harness.createSession(body as SessionIntent & { condition?: Condition }, resolved.userId);
  });

  app.get("/sessions/:id/registration", async (req, reply) => {
    const { id } = req.params as { id: string };
    const registration = await harness.registration(id);
    if (!registration) return reply.code(404).send({ error: "session not found" });
    return registration;
  });

  app.get("/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const snapshot = harness.sessionSnapshot(id);
    if (!snapshot) return reply.code(404).send({ error: "session not found" });
    return snapshot;
  });

  app.post("/sessions/:id/tool", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as Partial<ToolCall>;
    if (!body.name) return reply.code(400).send({ error: "tool name is required" });
    const outcome = await harness.runTool(id, { name: body.name, args: body.args });
    if (!outcome) return reply.code(404).send({ error: "session not found" });
    return outcome;
  });

  app.post("/sessions/:id/now_playing", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ensureOwner(req, reply, id))) return reply;
    const { track_id } = (req.body ?? {}) as { track_id?: string };
    if (!track_id) return reply.code(400).send({ error: "track_id is required" });
    const result = await harness.markNowPlaying(id, track_id);
    if (result === undefined) return reply.code(404).send({ error: "session not found" });
    if (result === false) return reply.code(400).send({ error: "unknown track_id" });
    return result;
  });

  app.post("/sessions/:id/cue", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ensureOwner(req, reply, id))) return reply;
    const { kind } = (req.body ?? {}) as { kind?: string };
    const ok = await harness.cue(id, kind === "outro" ? "outro" : "break");
    if (!ok) return reply.code(404).send({ error: "session not found" });
    return { ok: true };
  });

  app.post("/sessions/:id/host-mode", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ensureOwner(req, reply, id))) return reply;
    const { host_mode } = (req.body ?? {}) as { host_mode?: unknown };
    const result = await harness.changeHostMode(id, host_mode);
    if (result === undefined) return reply.code(404).send({ error: "session not found" });
    if (result === false) return reply.code(400).send({ error: "host_mode is required" });
    return result;
  });

  app.post("/sessions/:id/playlist-feedback", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ensureOwner(req, reply, id))) return reply;
    const { feedback } = (req.body ?? {}) as { feedback?: unknown };
    const result = await harness.playlistFeedback(id, feedback);
    if (result === undefined) return reply.code(404).send({ error: "session not found" });
    if (result === false) return reply.code(400).send({ error: "feedback must be like, dislike, or regenerate" });
    return {
      ok: true,
      feedback,
      ...(result.regenerate ? { regenerate: result.regenerate } : {}),
    };
  });

  app.post("/sessions/:id/regenerate", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ensureOwner(req, reply, id))) return reply;
    const result = await harness.regenerateQueue(id);
    if (!result) return reply.code(404).send({ error: "session not found" });
    return result;
  });

  app.post("/sessions/:id/extend", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ensureOwner(req, reply, id))) return reply;
    const ok = await harness.retryExtend(id);
    if (!ok) return reply.code(404).send({ error: "session not found" });
    return { ok: true };
  });

  app.post("/sessions/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await ensureOwner(req, reply, id))) return reply;
    const { event_type, payload } = (req.body ?? {}) as { event_type?: string; payload?: unknown };
    if (!event_type) return reply.code(400).send({ error: "event_type is required" });
    const ok = await harness.recordClientEvent(id, event_type, payload ?? {});
    if (!ok) return reply.code(404).send({ error: "session not found" });
    return { ok: true };
  });
}
