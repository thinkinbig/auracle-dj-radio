import { randomUUID } from "node:crypto";
import type { Condition, HostMode, SessionIntent, TrackMeta } from "@auracle/shared";
import { parseHostMode } from "@auracle/shared";
import { buildRegistration } from "../dj/registration.js";
import type { MemoryServiceClient } from "../memory-service-client.js";
import type { MusicEngineClient } from "../music-engine-client.js";
import type { ProxyClient } from "../proxy-client.js";
import { buildAndPushCue } from "../session/cue.js";
import type { OrchestrationDeps } from "../session/replan.js";
import { SessionStore } from "../session/store.js";
import { runTool, type ToolCall } from "../session/tool-runner.js";

export interface AgentHarnessDeps {
  store: SessionStore;
  memory: MemoryServiceClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
  proxyPublicUrl: string;
  log?: { warn(payload: unknown, message?: string): void; info(payload: unknown, message?: string): void };
}

export interface CreateSessionInput extends SessionIntent {
  condition?: Condition;
}

function parseIntent(raw: unknown): SessionIntent | undefined {
  const b = (raw ?? {}) as Partial<SessionIntent>;
  if (!b.mood || !b.scene) return undefined;
  return { mood: b.mood, scene: b.scene, duration_min: b.duration_min ?? 25 };
}

export class AgentHarness {
  private readonly orchestration: OrchestrationDeps;

  constructor(private readonly deps: AgentHarnessDeps) {
    this.orchestration = {
      store: deps.store,
      memory: deps.memory,
      music: deps.music,
      proxy: deps.proxy,
    };
  }

  parseSessionIntent(raw: unknown): SessionIntent | undefined {
    return parseIntent(raw);
  }

  async createSession(input: CreateSessionInput, userId: string): Promise<Record<string, unknown>> {
    const intent = parseIntent(input);
    if (!intent) throw new Error("mood and scene are required");
    const condition: Condition = input.condition ?? "C";
    // Personalization is best-effort and condition-C-only; must not block session create.
    const [mem0Context, energyWeights] =
      condition === "C"
        ? await Promise.all([
            this.deps.memory
              .recall(`music preferences for a ${intent.mood} ${intent.scene} session`, userId)
              .catch(() => ""),
            this.deps.memory.skipRateByEnergy(userId, 10).catch(() => undefined),
          ])
        : ["", undefined] as const;
    const plan = await this.deps.music.planTracklist({ intent, mode: "full", memories: mem0Context, energyWeights });
    const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
    const state = this.deps.store.create({
      userId,
      intent,
      condition,
      energyWeights,
      title: plan.result.session_title,
      subtitle: plan.result.session_subtitle,
      arc: plan.result.arc,
      tracklist: plan.result.tracklist,
      candidatesById,
      mem0Context,
    });

    await this.deps.memory
      .recordEvent(state.id, state.userId, "session_created", { intent, condition, tracklist: plan.result.tracklist })
      .catch((err) => this.deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "record session_created failed"));

    const openingTrack = await this.openingTrack(state.tracklist[0]?.id);
    const registration = buildRegistration(state, openingTrack);
    const token = randomUUID();
    try {
      await this.deps.proxy.register(state.id, token, registration);
    } catch (err) {
      this.deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "proxy register failed");
    }

    return {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      host_mode: state.hostMode,
      current_track_index: state.currentTrackIndex,
      tracklist: state.tracklist,
      mem0_context: state.mem0Context,
      proxy_url: this.deps.proxyPublicUrl,
      token,
    };
  }

  sessionSnapshot(id: string): Record<string, unknown> | undefined {
    const state = this.deps.store.get(id);
    if (!state) return undefined;
    return {
      session_id: state.id,
      session_title: state.title,
      session_subtitle: state.subtitle,
      host_mode: state.hostMode,
      current_track_index: state.currentTrackIndex,
      tracklist: state.tracklist,
      remaining: this.deps.store.remaining(state),
      mem0_context: state.mem0Context,
    };
  }

  async registration(id: string): Promise<ReturnType<typeof buildRegistration> | undefined> {
    const state = this.deps.store.get(id);
    if (!state) return undefined;
    return buildRegistration(state, await this.openingTrack(state.tracklist[0]?.id));
  }

  async runTool(id: string, call: ToolCall): Promise<Awaited<ReturnType<typeof runTool>> | undefined> {
    const state = this.deps.store.get(id);
    if (!state) return undefined;
    return runTool(this.orchestration, state, call);
  }

  async markNowPlaying(id: string, trackId: string): Promise<Record<string, unknown> | undefined | false> {
    const state = this.deps.store.get(id);
    if (!state) return undefined;

    const prevIndex = state.currentTrackIndex;
    const prevStartedAtMs = state.trackStartedAtMs;
    if (!this.deps.store.markStarted(state, trackId)) return false;

    if (state.pendingSkipAtMs != null && state.currentTrackIndex !== prevIndex) {
      const ms = Date.now() - state.pendingSkipAtMs;
      const skipped = state.tracklist[prevIndex];
      const energy = skipped ? (state.energyById.get(skipped.id) ?? null) : null;
      const listenedMs = prevStartedAtMs != null ? state.pendingSkipAtMs - prevStartedAtMs : null;
      // Clear the pending timer BEFORE any await so a memory-service failure
      // can't leak it into the next now_playing (bogus latency / re-fired skip).
      state.pendingSkipAtMs = undefined;
      await this.deps.memory
        .recordEvent(state.id, state.userId, "skip_latency", { ms, from_index: prevIndex, to_index: state.currentTrackIndex, energy })
        .catch((err) => this.deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "record skip_latency failed"));
      if (state.condition === "C" && listenedMs != null && listenedMs >= 0 && listenedMs < 60_000) {
        void this.deps.memory
          .remember(
            `User skipped a track after ${Math.round(listenedMs / 1000)}s during a "${state.intent.mood}" ${state.intent.scene} session${energy != null ? ` (energy ${energy}/5)` : ""}.`,
            state.id,
            state.userId,
          )
          .catch(() => {});
      }
      this.deps.log?.info({ sessionId: state.id, ms }, "skip round-trip latency");
    }
    state.trackStartedAtMs = Date.now();

    return { current_track_index: state.currentTrackIndex, remaining: this.deps.store.remaining(state) };
  }

  async cue(id: string, kind: "break" | "outro"): Promise<boolean> {
    const state = this.deps.store.get(id);
    if (!state) return false;
    await buildAndPushCue(this.orchestration, state, kind);
    return true;
  }

  async changeHostMode(id: string, rawMode: unknown): Promise<Record<string, unknown> | undefined | false> {
    const state = this.deps.store.get(id);
    if (!state) return undefined;
    const nextMode = parseHostMode(rawMode);
    if (!nextMode) return false;
    const previous: HostMode = state.hostMode;
    const changed = nextMode !== previous;
    if (changed) {
      state.hostMode = nextMode;
      await this.deps.memory.recordEvent(id, state.userId, "change_host_mode", { host_mode: nextMode, previous, source: "ui" });
      await this.deps.proxy.inject(id, {
        inject_text: `[host mode → ${nextMode}] Adopt this speaking style from your next line; don't announce the switch. Playlist unchanged.`,
      });
    }
    return { ok: true, host_mode: nextMode, previous, changed };
  }

  async recordClientEvent(id: string, eventType: string, payload: unknown): Promise<boolean> {
    const state = this.deps.store.get(id);
    if (!state) return false;
    await this.deps.memory.recordEvent(id, state.userId, eventType, payload ?? {});
    return true;
  }

  private async openingTrack(id: string | undefined): Promise<TrackMeta | undefined> {
    return id ? this.deps.music.getTrack(id) : undefined;
  }
}
