import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { Condition, SessionIntent } from "@auracle/shared";
import { parseHostMode } from "@auracle/shared";
import type { RegisterCredentials, AuthCredentials } from "@auracle/shared";
import type { AuthStore } from "./auth-store.js";
import { EventsDb } from "./events-db.js";
import { SessionStore } from "./session/store.js";
import type { MusicEngineClient } from "./music-engine-client.js";
import type { MemoryClient } from "./memory/client.js";
import type { ProxyClient } from "./proxy-client.js";
import { buildRegistration } from "./dj/registration.js";
import { runTool, type ToolCall } from "./session/tool-runner.js";
import { buildAndPushCue } from "./session/cue.js";
import type { OrchestrationDeps } from "./session/replan.js";

export interface MemoryServiceDeps {
  store: SessionStore;
  events: EventsDb;
  music: MusicEngineClient;
  memory: MemoryClient;
  proxy: ProxyClient;
  /** Public base URL of the proxy handed to the browser for the SDP offer. */
  proxyPublicUrl: string;
  auth: AuthStore;
}

function parseIntent(raw: unknown): SessionIntent | undefined {
  const b = (raw ?? {}) as Partial<SessionIntent>;
  if (!b.mood || !b.scene) return undefined;
  return { mood: b.mood, scene: b.scene, duration_min: b.duration_min ?? 25 };
}

function bearerToken(raw: string | undefined): string | undefined {
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function parseCredentials(raw: unknown): AuthCredentials | undefined {
  const body = (raw ?? {}) as Partial<AuthCredentials>;
  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password || password.length < 6) return undefined;
  return { email, password };
}

/**
 * Memory-service: the stateful orchestrator. Owns session state + the analytics
 * event log; sources tracklists from music-engine over HTTP. Phase 2a stands the
 * service up in isolation — the live path stays on the apps/api relay until Phase 3.
 */
export function buildServer(deps: MemoryServiceDeps): FastifyInstance {
  const { store, events, music, memory, proxy, proxyPublicUrl, auth } = deps;
  const orchestration: OrchestrationDeps = { store, events, memory, music, proxy };
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/register", async (req, reply) => {
    const credentials = parseCredentials(req.body);
    if (!credentials) return reply.code(400).send({ error: "valid email and password are required" });
    const { name } = (req.body ?? {}) as Partial<RegisterCredentials>;
    const user = auth.createUser({ ...credentials, name });
    if (!user) return reply.code(409).send({ error: "email already registered" });
    return { user, token: auth.createSession(user.id) };
  });

  app.post("/auth/login", async (req, reply) => {
    const credentials = parseCredentials(req.body);
    if (!credentials) return reply.code(400).send({ error: "valid email and password are required" });
    const user = auth.verifyUser(credentials.email, credentials.password);
    if (!user) return reply.code(401).send({ error: "invalid email or password" });
    return { user, token: auth.createSession(user.id) };
  });

  app.get("/auth/me", async (req, reply) => {
    const user = auth.getUserByToken(bearerToken(req.headers.authorization));
    if (!user) return reply.code(401).send({ error: "not authenticated" });
    return { user };
  });

  app.post("/auth/logout", async (req) => {
    auth.deleteSession(bearerToken(req.headers.authorization));
    return { ok: true };
  });

  app.post("/sessions", async (req, reply) => {
    const body = (req.body ?? {}) as Partial<SessionIntent> & { condition?: Condition };
    const intent = parseIntent(body);
    if (!intent) return reply.code(400).send({ error: "mood and scene are required" });
    const condition: Condition = body.condition ?? "C";

    // Cross-session memory only feeds the experimental arm (condition "C");
    // A/B carry no prior context. mem0 degrades to "" when the stack is absent.
    const mem0Context =
      condition === "C"
        ? await memory.recall(`music preferences for a ${intent.mood} ${intent.scene} session`)
        : "";

    // Skip weights apply to all conditions — behavioral signal, not experimental arm.
    const energyWeights = events.skipRateByEnergy(10);
    const plan = await music.planTracklist({ intent, mode: "full", memories: mem0Context, energyWeights });
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

    // Push the pre-baked registration to the proxy before the browser connects
    // (proxy assembles no prompts). Best-effort: a proxy hiccup must not lose the
    // session/analytics — the browser still gets proxy_url and can retry/connect.
    const openingId = state.tracklist[0]?.id;
    const openingTrack = openingId ? await music.getTrack(openingId) : undefined;
    const registration = buildRegistration(state, openingTrack);
    const token = randomUUID();
    try {
      await proxy.register(state.id, token, registration);
    } catch (err) {
      app.log.warn({ err: (err as Error).message, sessionId: state.id }, "proxy register failed");
    }

    return {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      host_mode: state.hostMode,
      current_track_index: state.currentTrackIndex,
      tracklist: state.tracklist,
      mem0_context: state.mem0Context,
      proxy_url: proxyPublicUrl,
      token,
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

  // Lane 1: the proxy forwards a Gemini function call here; we run the side-effect
  // and return { gemini_result (→ Gemini), ui_events (→ browser data channel) }.
  app.post("/sessions/:id/tool", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const body = (req.body ?? {}) as Partial<ToolCall>;
    if (!body.name) return reply.code(400).send({ error: "tool name is required" });
    return runTool(orchestration, state, { name: body.name, args: body.args });
  });

  // Playhead mirror (Lane 2): the browser is the sole playhead writer and reports
  // which track started; we mirror it so replan/cues target the right slot. Also
  // closes the skip round-trip timer (skip_track → browser advance → here).
  app.post("/sessions/:id/now_playing", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const { track_id } = (req.body ?? {}) as { track_id?: string };
    if (!track_id) return reply.code(400).send({ error: "track_id is required" });

    const prevIndex = state.currentTrackIndex;
    const prevStartedAtMs = state.trackStartedAtMs;
    if (!store.markStarted(state, track_id)) return reply.code(400).send({ error: "unknown track_id" });

    if (state.pendingSkipAtMs != null && state.currentTrackIndex !== prevIndex) {
      const ms = Date.now() - state.pendingSkipAtMs;
      const skipped = state.tracklist[prevIndex];
      const energy = skipped ? (state.energyById.get(skipped.id) ?? null) : null;
      events.recordEvent(state.id, "skip_latency", {
        ms,
        from_index: prevIndex,
        to_index: state.currentTrackIndex,
        energy,
      });
      if (state.condition === "C" && prevStartedAtMs != null) {
        const listenedMs = state.pendingSkipAtMs - prevStartedAtMs;
        if (listenedMs >= 0 && listenedMs < 60_000) {
          void memory.remember(
            `User skipped a track after ${Math.round(listenedMs / 1000)}s during a "${state.intent.mood}" ${state.intent.scene} session${energy != null ? ` (energy ${energy}/5)` : ""}.`,
            state.id,
          );
        }
      }
      state.pendingSkipAtMs = undefined;
      app.log.info({ sessionId: state.id, ms }, "skip round-trip latency");
    }
    state.trackStartedAtMs = Date.now();

    return { current_track_index: state.currentTrackIndex, remaining: store.remaining(state) };
  });

  // End-of-track talk break (ADR-0004): the browser fires this near a track's tail
  // and the DJ speaks the break/outro, pushed via Lane-3 inject_text. Replaces the
  // relay's server-side cue — the browser owns the playhead.
  app.post("/sessions/:id/cue", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const { kind } = (req.body ?? {}) as { kind?: string };
    const cueKind = kind === "outro" ? "outro" : "break";
    await buildAndPushCue(orchestration, state, cueKind);
    return { ok: true };
  });

  // UI pill (Lane 2): the listener flips the host mode. Update state, log it, and
  // nudge the DJ to adopt the new style on its next line (the DJ-tool path is
  // separate). Only nudges when the mode actually changed.
  app.post("/sessions/:id/host-mode", async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = store.get(id);
    if (!state) return reply.code(404).send({ error: "session not found" });
    const { host_mode } = (req.body ?? {}) as { host_mode?: unknown };
    const nextMode = parseHostMode(host_mode);
    if (!nextMode) return reply.code(400).send({ error: "host_mode is required" });
    const previous = state.hostMode;
    const changed = nextMode !== previous;
    if (changed) {
      state.hostMode = nextMode;
      events.recordEvent(id, "change_host_mode", { host_mode: nextMode, previous, source: "ui" });
      await proxy.inject(id, {
        inject_text: `[host mode → ${nextMode}] Adopt this speaking style from your next line; don't announce the switch. Playlist unchanged.`,
      });
    }
    return { ok: true, host_mode: nextMode, previous, changed };
  });

  // Browser analytics parity: record a client-side event into the session log.
  app.post("/sessions/:id/events", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!store.get(id)) return reply.code(404).send({ error: "session not found" });
    const { event_type, payload } = (req.body ?? {}) as { event_type?: string; payload?: unknown };
    if (!event_type) return reply.code(400).send({ error: "event_type is required" });
    events.recordEvent(id, event_type, payload ?? {});
    return { ok: true };
  });

  return app;
}
