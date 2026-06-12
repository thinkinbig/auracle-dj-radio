import Fastify, { type FastifyInstance } from "fastify";
import type { Condition, SessionIntent } from "@auracle/shared";
import { EventsDb } from "./events-db.js";
import { SessionStore } from "./session/store.js";
import type { MusicEngineClient } from "./music-engine-client.js";
import type { MemoryClient } from "./memory/client.js";
import { buildRegistration } from "./dj/registration.js";

export interface MemoryServiceDeps {
  store: SessionStore;
  events: EventsDb;
  music: MusicEngineClient;
  memory: MemoryClient;
}

function parseIntent(raw: unknown): SessionIntent | undefined {
  const b = (raw ?? {}) as Partial<SessionIntent>;
  if (!b.mood || !b.scene) return undefined;
  return { mood: b.mood, scene: b.scene, duration_min: b.duration_min ?? 25 };
}

/**
 * Memory-service: the stateful orchestrator. Owns session state + the analytics
 * event log; sources tracklists from music-engine over HTTP. Phase 2a stands the
 * service up in isolation — the live path stays on the apps/api relay until Phase 3.
 */
export function buildServer(deps: MemoryServiceDeps): FastifyInstance {
  const { store, events, music, memory } = deps;
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.post("/sessions", async (req, reply) => {
    const body = (req.body ?? {}) as Partial<SessionIntent> & { condition?: Condition };
    const intent = parseIntent(body);
    if (!intent) return reply.code(400).send({ error: "mood and scene are required" });
    const condition: Condition = body.condition ?? "C";

    // Cross-session memory only feeds the experimental arm (condition "C");
    // A/B carry no prior context. mem0 degrades to "" when the stack is absent.
    const mem0Context = condition === "C" ? await memory.recall(`${intent.mood} ${intent.scene}`) : "";

    const plan = await music.planTracklist({ intent, mode: "full", memories: mem0Context });
    const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
    const state = store.create({
      intent,
      condition,
      title: plan.result.session_title,
      subtitle: plan.result.session_subtitle,
      arc: plan.result.arc,
      tracklist: plan.result.tracklist,
      candidatesById,
      mem0Context,
    });
    events.recordEvent(state.id, "session_created", {
      intent,
      condition,
      tracklist: plan.result.tracklist,
    });

    return {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      host_mode: state.hostMode,
      current_track_index: state.currentTrackIndex,
      tracklist: state.tracklist,
      mem0_context: state.mem0Context,
    };
  });

  // Pre-baked Gemini registration contract for the proxy (Phase 3 consumer):
  // fully-assembled systemInstruction + tools + openingCue. Internal, never the browser.
  app.get("/sessions/:id/registration", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const openingId = state.tracklist[0]?.id;
    const openingTrack = openingId ? await music.getTrack(openingId) : undefined;
    return buildRegistration(state, openingTrack);
  });

  app.get("/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    return {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      host_mode: state.hostMode,
      current_track_index: state.currentTrackIndex,
      tracklist: state.tracklist,
      remaining: store.remaining(state),
      mem0_context: state.mem0Context,
    };
  });

  return app;
}
