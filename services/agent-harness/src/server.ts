import Fastify, { type FastifyInstance } from "fastify";
import { parseBearerToken, type Condition, type SessionIntent } from "@auracle/shared";
import { AgentHarness } from "./harness/agent-harness.js";
import type { MemoryServiceClient } from "./memory-service-client.js";
import type { MusicEngineClient } from "./music-engine-client.js";
import type { ProxyClient } from "./proxy-client.js";
import { SessionStore } from "./session/store.js";
import type { ToolCall } from "./session/tool-runner.js";

export interface AgentHarnessDeps {
  store: SessionStore;
  memory: MemoryServiceClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
  /** Public base URL of the proxy handed to the browser for the SDP offer. */
  proxyPublicUrl: string;
}

/**
 * Agent-harness owns the runtime orchestration loop: session state, DJ tool
 * side-effects, playlist replan triggers, proxy pushes, and traceable decisions.
 */
export function buildServer(deps: AgentHarnessDeps): FastifyInstance {
  const app = Fastify({ logger: true });
  const harness = new AgentHarness({ ...deps, log: app.log });

  app.get("/health", async () => ({ ok: true }));

  app.post("/sessions", async (req, reply) => {
    const body = (req.body ?? {}) as Partial<SessionIntent> & { condition?: Condition };
    if (!harness.parseSessionIntent(body)) return reply.code(400).send({ error: "mood and scene are required" });
    const token = parseBearerToken(req.headers.authorization);
    const resolved = await deps.memory.resolveSessionUser(token);
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
    const { track_id } = (req.body ?? {}) as { track_id?: string };
    if (!track_id) return reply.code(400).send({ error: "track_id is required" });
    const result = await harness.markNowPlaying(id, track_id);
    if (result === undefined) return reply.code(404).send({ error: "session not found" });
    if (result === false) return reply.code(400).send({ error: "unknown track_id" });
    return result;
  });

  app.post("/sessions/:id/cue", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { kind } = (req.body ?? {}) as { kind?: string };
    const ok = await harness.cue(id, kind === "outro" ? "outro" : "break");
    if (!ok) return reply.code(404).send({ error: "session not found" });
    return { ok: true };
  });

  app.post("/sessions/:id/host-mode", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { host_mode } = (req.body ?? {}) as { host_mode?: unknown };
    const result = await harness.changeHostMode(id, host_mode);
    if (result === undefined) return reply.code(404).send({ error: "session not found" });
    if (result === false) return reply.code(400).send({ error: "host_mode is required" });
    return result;
  });

  app.post("/sessions/:id/regenerate", async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await harness.regenerateQueue(id);
    if (!result) return reply.code(404).send({ error: "session not found" });
    return result;
  });

  app.post("/sessions/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { event_type, payload } = (req.body ?? {}) as { event_type?: string; payload?: unknown };
    if (!event_type) return reply.code(400).send({ error: "event_type is required" });
    const ok = await harness.recordClientEvent(id, event_type, payload ?? {});
    if (!ok) return reply.code(404).send({ error: "session not found" });
    return { ok: true };
  });

  return app;
}
