import { existsSync, createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import type {
  Condition,
  CreateSessionResponse,
  SessionIntent,
  SessionStateResponse,
} from "@auracle/shared";
import type { ApiContext } from "../context.js";
import { createPlan } from "../flow/plan.js";
import { applyReplan } from "../session/replan-service.js";

export function registerRoutes(app: FastifyInstance, ctx: ApiContext): void {
  app.post("/sessions", async (req, reply) => {
    const body = (req.body ?? {}) as Partial<SessionIntent> & { condition?: Condition };
    if (!body.mood || !body.scene) {
      return reply.code(400).send({ error: "mood and scene are required" });
    }
    const intent: SessionIntent = {
      mood: body.mood,
      scene: body.scene,
      duration_min: body.duration_min ?? 25,
    };
    const condition: Condition = body.condition ?? "C";

    const { result, violations, candidatesById } = await createPlan(ctx.planDeps, intent);
    const state = ctx.store.create({
      intent,
      condition,
      title: result.session_title,
      subtitle: result.session_subtitle,
      arc: result.arc,
      tracklist: result.tracklist,
      candidatesById,
      mem0Context: "",
    });
    ctx.db.recordEvent(state.id, "session_created", {
      intent,
      condition,
      violations,
      tracklist: result.tracklist,
    });

    const res: CreateSessionResponse = {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      tracklist: state.tracklist,
      mem0_context: state.mem0Context,
      live_ws_url: `/sessions/${state.id}/live`,
    };
    return res;
  });

  app.get("/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = ctx.store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const res: SessionStateResponse = {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      current_track_index: state.currentTrackIndex,
      tracklist: state.tracklist,
      remaining: ctx.store.remaining(state),
      mem0_context: state.mem0Context,
    };
    return res;
  });

  app.post("/sessions/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = ctx.store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const body = (req.body ?? {}) as { event_type?: string; payload?: Record<string, unknown> };
    if (!body.event_type) return reply.code(400).send({ error: "event_type is required" });

    // track_started advances the playback pointer; other events are just logged.
    const trackId = body.payload?.track_id;
    if (body.event_type === "track_started" && typeof trackId === "string") {
      ctx.store.markStarted(state, trackId);
    }
    ctx.db.recordEvent(id, body.event_type, body.payload ?? {});
    return { ok: true, current_track_index: state.currentTrackIndex };
  });

  app.post("/sessions/:id/replan", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = ctx.store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const body = (req.body ?? {}) as { mood?: string; energy_delta?: "lighter" | "heavier" | "same" };
    if (!body.mood) return reply.code(400).send({ error: "mood is required" });
    return applyReplan(ctx, state, { mood: body.mood, energy_delta: body.energy_delta });
  });

  app.get("/tracks/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const track = ctx.db.getTrack(id);
    if (!track) return reply.code(404).send({ error: "track not found" });
    const { embedding: _embedding, ...meta } = track;
    return meta;
  });

  app.get("/tracks/:id/audio", async (req, reply) => {
    const { id } = req.params as { id: string };
    const track = ctx.db.getTrack(id);
    if (!track || !existsSync(track.filePath)) {
      return reply.code(404).send({ error: "audio not available" });
    }
    return reply.type("audio/mpeg").send(createReadStream(track.filePath));
  });
}
