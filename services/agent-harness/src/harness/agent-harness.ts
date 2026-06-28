import { randomUUID } from "node:crypto";
import type { Condition, HostMode, RegenerateSessionResponse, SessionIntent, TastePreference, TrackMeta } from "@auracle/shared";
import { parseHostMode } from "@auracle/shared";
import { buildRegistration } from "../dj/registration.js";
import type { MemoryServiceClient } from "../memory-service-client.js";
import type { MusicEngineClient } from "../music-engine-client.js";
import type { ProxyClient } from "../proxy-client.js";
import { buildAndPushCue } from "../session/cue.js";
import { extendQueue } from "../session/extend.js";
import { applyReplan, changedIdsFromRemaining, type OrchestrationDeps } from "../session/replan.js";
import { swapNextOnQuickSkip } from "../session/skip-swap.js";
import { SessionStore, type SessionState } from "../session/store.js";
import { runTool, type ToolCall } from "../session/tool-runner.js";

const QUICK_SKIP_MEMORY_THRESHOLD = 2;
const QUICK_SKIP_MAX_LISTEN_MS = 60_000;

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
    const [mem0Context, energyWeights, taste]: [string, Partial<Record<number, number>> | undefined, TastePreference[] | undefined] =
      condition === "C"
        ? await Promise.all([
            this.deps.memory.recallForIntent(userId, intent.mood, intent.scene).catch(() => ""),
            this.deps.memory.skipRateByEnergy(userId, 10).catch(() => undefined),
            this.deps.memory.tasteWeights(userId).catch(() => undefined),
          ])
        : ["", undefined, undefined];
    const tieBreakSeed = randomUUID();
    const plan = await this.deps.music.planTracklist({ intent, mode: "provisional", memories: mem0Context, energyWeights, taste, tieBreakSeed });
    const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
    const state = this.deps.store.create({
      userId,
      intent,
      condition,
      energyWeights,
      taste,
      tieBreakSeed,
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

    void this.refineSessionCopywriting(state);

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

  /**
   * P3.1: start playback from the deterministic tracklist immediately, then let
   * the full planner/copywriter improve title/subtitle/reasons in the background.
   * Already-played/current tracks are never replaced, so the first track can keep
   * playing at full speed while copy lands later.
   */
  private async refineSessionCopywriting(state: SessionState): Promise<void> {
    try {
      const plan = await this.deps.music.planTracklist({
        intent: state.intent,
        mode: "full",
        memories: state.mem0Context,
        energyWeights: state.energyWeights,
        taste: state.taste,
        tieBreakSeed: state.tieBreakSeed,
      });
      const previousTitle = state.title;
      const previousSubtitle = state.subtitle;
      const previousRemainingIds = this.deps.store.remaining(state).map((r) => r.id);
      const previousRemaining = previousRemainingIds.join(" ");

      state.title = plan.result.session_title || state.title;
      state.subtitle = plan.result.session_subtitle || state.subtitle;
      state.arc = plan.result.arc;

      const candidatesById = new Map(plan.candidates.map((c) => [c.id, c]));
      const lockedIds = new Set(state.tracklist.slice(0, state.currentTrackIndex + 1).map((r) => r.id));
      const current = state.tracklist[state.currentTrackIndex];
      const matchingCurrent = current ? plan.result.tracklist.find((r) => r.id === current.id) : undefined;
      if (current && matchingCurrent) current.reason = matchingCurrent.reason;

      const refinedRemaining = plan.result.tracklist.filter((r) => !lockedIds.has(r.id));
      const remaining = this.deps.store.replaceRemaining(state, refinedRemaining, candidatesById);
      this.deps.store.markRefined(state);

      const nextRemaining = remaining.map((r) => r.id).join(" ");
      const changed = previousTitle !== state.title || previousSubtitle !== state.subtitle || previousRemaining !== nextRemaining;
      if (!changed) return;

      await this.deps.proxy
        .inject(state.id, {
          ui_events: [
            {
              type: "tracklist_updated",
              remaining,
              changed_ids: changedIdsFromRemaining(previousRemainingIds, remaining),
              before_remaining_ids: previousRemainingIds,
              session_title: state.title,
              session_subtitle: state.subtitle,
            },
          ],
        })
        .catch((err) =>
          this.deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "copywriting refine proxy push failed"),
        );
    } catch (err) {
      this.deps.log?.warn({ err: (err as Error).message, sessionId: state.id }, "copywriting refine failed");
    }
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
      const repeatedQuickSkipEnergy = this.trackRepeatedQuickSkip(state, listenedMs, energy);
      if (repeatedQuickSkipEnergy != null) {
        this.rememberRepeatedQuickSkip(state, repeatedQuickSkipEnergy);
        // Deterministic next-track swap on repeated same-energy quick skips (E4):
        // fire-and-forget so it never blocks the skip round trip; B and C only
        // (A is excluded upstream). Failures are swallowed inside the module.
        void swapNextOnQuickSkip(this.orchestration, state, repeatedQuickSkipEnergy);
      }
      this.deps.log?.info({ sessionId: state.id, ms }, "skip round-trip latency");
    }
    state.trackStartedAtMs = Date.now();

    // Rolling extend (E1): keep the station on air when the queue runs low.
    // Fire-and-forget and debounced inside the module so it never blocks now_playing.
    void extendQueue(this.orchestration, state, this.deps.log);

    return { current_track_index: state.currentTrackIndex, remaining: this.deps.store.remaining(state) };
  }

  /**
   * Track the run of quick skips at the same energy. Returns that energy once the
   * user has quick-skipped it enough times to act on (mem0 write + queue swap),
   * else null. Condition A never accumulates (ablation); B and C behave the same,
   * so the swap fires for both.
   */
  private trackRepeatedQuickSkip(state: SessionState, listenedMs: number | null, energy: number | null): number | null {
    if (state.condition === "A" || listenedMs == null || listenedMs < 0 || listenedMs >= QUICK_SKIP_MAX_LISTEN_MS || energy == null) {
      state.quickSkipRun = undefined;
      return null;
    }

    const previous = state.quickSkipRun;
    state.quickSkipRun = previous?.energy === energy ? { energy, count: previous.count + 1 } : { energy, count: 1 };
    return state.quickSkipRun.count >= QUICK_SKIP_MEMORY_THRESHOLD ? energy : null;
  }

  /** Write a high-signal cross-session mem0 fact for a disliked energy — Condition C only, once per energy. */
  private rememberRepeatedQuickSkip(state: SessionState, energy: number): void {
    if (state.condition !== "C" || state.rememberedQuickSkipEnergies.has(energy)) return;
    state.rememberedQuickSkipEnergies.add(energy);
    void this.deps.memory
      .remember(
        `User repeatedly skipped energy ${energy}/5 tracks quickly during a "${state.intent.mood}" ${state.intent.scene} session; prefer a different energy level for this context.`,
        state.id,
        state.userId,
      )
      .catch(() => {});
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

  async regenerateQueue(id: string): Promise<RegenerateSessionResponse | undefined> {
    const state = this.deps.store.get(id);
    if (!state) return undefined;

    const before = this.deps.store.remaining(state).map((track) => track.id);
    const outcome = await applyReplan(this.orchestration, state, {
      mood: state.intent.mood,
      energy_delta: "same",
      scope: "full", // Regenerate replaces the whole remaining queue, not a nudge.
      reroll: true, // Each click re-rolls: fresh seed + steer away from the shown tracks.
    });

    await this.deps.memory.recordEvent(id, state.userId, "playlist_regenerate_requested", {
      current_track_id: state.tracklist[state.currentTrackIndex]?.id ?? null,
      before,
      after: outcome.remaining.map((track) => track.id),
      replanned: outcome.replanned,
    });

    // Client-initiated (Regenerate button): the HTTP response below is the
    // authoritative delivery to the only client -- no redundant proxy push (one
    // logical change, one channel). Server-initiated queue changes (mood_change
    // replan, rolling extend, skip-swap) push via pushQueueUpdate instead.
    return {
      ok: true,
      replanned: outcome.replanned,
      session_title: state.title,
      session_subtitle: state.subtitle,
      current_track_index: state.currentTrackIndex,
      tracklist: state.tracklist,
      remaining: outcome.remaining,
      changed_ids: changedIdsFromRemaining(before, outcome.remaining),
      before_remaining_ids: before,
    };
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
