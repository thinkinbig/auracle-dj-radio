import { existsSync, createReadStream, statSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import type {
  Condition,
  CreateSessionResponse,
  HostMode,
  SessionIntent,
  SessionStateResponse,
} from "@auracle/shared";
import { parseHostMode } from "@auracle/shared";
import type { ApiContext } from "../context.js";
import { toTrackMeta, tracksWithAssets } from "../catalog/manifest.js";
import { FULL_SESSION_LENGTH } from "@auracle/shared";
import { createPlanCached, createProvisionalPlan, peekPlanCache } from "../flow/plan.js";
import { applyReplan } from "../session/replan-service.js";
import { attachLiveRelay, type RelayDeps } from "../live/relay.js";
import type { SessionState } from "../session/store.js";

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

    // Condition C reads cross-session preferences into the plan and the DJ prompt; A/B don't.
    const mem0Context = condition === "C" ? await ctx.memory.recall(`${intent.mood} ${intent.scene}`) : "";

    // Fast path: a previously cached clean plan is instant — return it whole, no refine.
    const cached = peekPlanCache(intent, mem0Context);
    let state: SessionState;
    if (cached) {
      state = ctx.store.create({
        intent,
        condition,
        title: cached.result.session_title,
        subtitle: cached.result.session_subtitle,
        arc: cached.result.arc,
        tracklist: cached.result.tracklist,
        candidatesById: cached.candidatesById,
        mem0Context,
      });
      ctx.db.recordEvent(state.id, "session_created", {
        intent,
        condition,
        violations: cached.violations,
        tracklist: cached.result.tracklist,
        cached: true,
      });
    } else {
      // Cache miss: return a deterministic provisional arc now so playback starts
      // immediately, then refine tracks 2..N with the real Flow in the background.
      const provisional = await createProvisionalPlan(ctx.planDeps, intent);
      state = ctx.store.create({
        intent,
        condition,
        title: provisional.result.session_title,
        subtitle: provisional.result.session_subtitle,
        arc: provisional.result.arc,
        tracklist: provisional.result.tracklist,
        candidatesById: provisional.candidatesById,
        mem0Context,
      });
      ctx.db.recordEvent(state.id, "session_created", {
        intent,
        condition,
        tracklist: provisional.result.tracklist,
        provisional: true,
      });
      void refinePlanInBackground(ctx, app, state, intent, mem0Context);
    }

    if (condition === "C" && ctx.memory.degraded) {
      app.log.warn("[mem0] Condition C session started with degraded memory — eval integrity affected");
    }

    const res: CreateSessionResponse = {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      host_mode: state.hostMode,
      tracklist: state.tracklist,
      mem0_context: state.mem0Context,
      mem0_available: ctx.memory.enabled && !ctx.memory.degraded,
      live_ws_url: `/sessions/${state.id}/live`,
    };
    return res;
  });

  app.get("/sessions/:id/live", { websocket: true }, (socket, req) => {
    const { id } = req.params as { id: string };
    const state = ctx.store.get(id);
    if (!state) {
      socket.send(JSON.stringify({ type: "error", message: "session not found" }));
      socket.close();
      return;
    }
    const relayDeps: RelayDeps = {
      recordEvent: (sid, type, payload) => ctx.db.recordEvent(sid, type, payload),
      getTrack: (id) => ctx.db.getTrack(id),
      memory: ctx.memory,
      replan: (s, params) => applyReplan(ctx, s, params),
      subscribeRefine: (s, listener) => ctx.store.subscribeRefine(s, listener),
    };
    void attachLiveRelay(socket, state, relayDeps);
  });

  app.get("/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = ctx.store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const res: SessionStateResponse = {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      host_mode: state.hostMode,
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

    // Append-only analytics log. The Playhead is owned by the browser and mirrored
    // to the relay over the live socket (CONTEXT: Playhead), not via this endpoint.
    ctx.db.recordEvent(id, body.event_type, body.payload ?? {});
    return { ok: true, current_track_index: state.currentTrackIndex };
  });

  app.post("/sessions/:id/host-mode", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = ctx.store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const body = (req.body ?? {}) as { host_mode?: unknown };
    const hostMode = parseHostMode(body.host_mode);
    if (!hostMode) return reply.code(400).send({ error: "host_mode is required" });
    const previous: HostMode = state.hostMode;
    state.hostMode = hostMode;
    ctx.db.recordEvent(id, "change_host_mode", { host_mode: hostMode, previous, source: "api" });
    return { ok: true, host_mode: hostMode, previous, changed: previous !== hostMode };
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
    const meta = ctx.db.getTrackMeta(id);
    if (!meta) return reply.code(404).send({ error: "track not found" });
    return meta;
  });

  app.get("/catalog/tracks", async () => ({
    tracks: tracksWithAssets().map(toTrackMeta),
  }));

  app.get("/tracks/:id/audio", async (req, reply) => {
    const { id } = req.params as { id: string };
    const track = ctx.db.getTrack(id);
    if (!track || !existsSync(track.filePath)) {
      return reply.code(404).send({ error: "audio not available" });
    }
    // Content-Length lets the browser <audio> element report a real duration.
    reply.header("content-length", statSync(track.filePath).size);
    // Track files are immutable per id — cache so the client's next-track prefetch sticks.
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.type("audio/mpeg").send(createReadStream(track.filePath));
  });
}

/**
 * Background plan refine: run the real Flow (and populate the cache), then graft
 * the LLM arc onto the already-playing provisional track 1 and notify the live
 * relay. On failure the provisional arc stays in place — playback is unaffected.
 */
async function refinePlanInBackground(
  ctx: ApiContext,
  app: FastifyInstance,
  state: SessionState,
  intent: SessionIntent,
  mem0Context: string,
): Promise<void> {
  try {
    const full = await createPlanCached(ctx.planDeps, intent, mem0Context);
    const playingId = state.tracklist[state.currentTrackIndex]?.id;
    const keepCount = FULL_SESSION_LENGTH - (state.currentTrackIndex + 1);
    const newRefs = full.result.tracklist.filter((r) => r.id !== playingId).slice(0, keepCount);
    const appended = ctx.store.replaceRemaining(state, newRefs, full.candidatesById);
    if (full.result.session_title) state.title = full.result.session_title;
    if (full.result.session_subtitle) state.subtitle = full.result.session_subtitle;
    ctx.store.markRefined(state);
    ctx.db.recordEvent(state.id, "plan_refined", {
      violations: full.violations,
      tracklist: state.tracklist,
      appended: appended.map((r) => r.id),
    });
  } catch (err) {
    app.log.warn(`[plan] background refine failed; keeping provisional arc: ${(err as Error).message}`);
  }
}
