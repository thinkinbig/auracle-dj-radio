import { buildNowPlayingContextInject } from "../dj/prompt.js";
import { buildAndPushCue } from "./cue.js";
import { resolveCueTrack } from "./cue-track.js";
import { extendQueue } from "./extend.js";
import type { OrchestrationDeps } from "./replan.js";
import { swapNextOnQuickSkip } from "./skip-swap.js";
import type { SessionState } from "./store.js";

const QUICK_SKIP_MEMORY_THRESHOLD = 2;
const QUICK_SKIP_MAX_LISTEN_MS = 60_000;

interface NowPlayingLog {
  warn(payload: unknown, message?: string): void;
  info(payload: unknown, message?: string): void;
}

/**
 * Apply a browser playhead update and run the orchestration that hangs off it:
 * skip latency telemetry, quick-skip learning/swap, now-playing context, intro
 * cues, and rolling extend. The browser remains the playhead writer; this only
 * mirrors its report into harness state.
 */
export async function markNowPlaying(
  deps: OrchestrationDeps,
  state: SessionState,
  trackId: string,
  log?: NowPlayingLog,
): Promise<Record<string, unknown> | false> {
  const prevIndex = state.currentTrackIndex;
  const prevStartedAtMs = state.trackStartedAtMs;
  if (!deps.store.markStarted(state, trackId)) return false;

  if (state.pendingSkipAtMs != null && state.currentTrackIndex !== prevIndex) {
    await recordSkipTransition(deps, state, prevIndex, prevStartedAtMs, log);
  }
  state.trackStartedAtMs = Date.now();

  pushNowPlayingContext(deps, state, log);
  pushIntroCue(deps, state, log);

  // Rolling extend is debounced internally and must never block now_playing.
  void extendQueue(deps, state, log);

  return { current_track_index: state.currentTrackIndex, remaining: deps.store.remaining(state) };
}

async function recordSkipTransition(
  deps: OrchestrationDeps,
  state: SessionState,
  prevIndex: number,
  prevStartedAtMs: number | undefined,
  log?: NowPlayingLog,
): Promise<void> {
  const ms = Date.now() - state.pendingSkipAtMs!;
  const skipped = state.tracklist[prevIndex];
  const energy = skipped ? (state.energyById.get(skipped.id) ?? null) : null;
  const listenedMs = prevStartedAtMs != null ? state.pendingSkipAtMs! - prevStartedAtMs : null;

  // Clear before any await so a memory-service failure cannot leak into the
  // next now_playing report.
  state.pendingSkipAtMs = undefined;
  await deps.memory
    .recordEvent(state.id, state.userId, "skip_latency", { ms, from_index: prevIndex, to_index: state.currentTrackIndex, energy })
    .catch((err) => log?.warn({ err: (err as Error).message, sessionId: state.id }, "record skip_latency failed"));

  const repeatedQuickSkipEnergy = trackRepeatedQuickSkip(state, listenedMs, energy);
  if (repeatedQuickSkipEnergy != null) {
    rememberRepeatedQuickSkip(deps, state, repeatedQuickSkipEnergy);
    void swapNextOnQuickSkip(deps, state, repeatedQuickSkipEnergy);
  }
  log?.info({ sessionId: state.id, ms }, "skip round-trip latency");
}

function pushNowPlayingContext(
  deps: OrchestrationDeps,
  state: SessionState,
  log?: NowPlayingLog,
): void {
  void resolveCueTrack(deps.music, state, state.tracklist[state.currentTrackIndex])
    .then((track) => {
      const inject = buildNowPlayingContextInject(track, state.hostMode);
      if (!inject) return;
      return deps.proxy.inject(state.id, { inject_text: inject });
    })
    .catch((err) => log?.warn({ err: (err as Error).message, sessionId: state.id }, "now playing context inject failed"));
}

function pushIntroCue(
  deps: OrchestrationDeps,
  state: SessionState,
  log?: NowPlayingLog,
): void {
  // Track 0's opening is auto-cued on connect; every later track gets an intro
  // over the browser's silent gate.
  if (state.currentTrackIndex <= 0) return;
  void buildAndPushCue(deps, state, "intro").catch((err) =>
    log?.warn({ err: (err as Error).message, sessionId: state.id }, "intro cue push failed"),
  );
}

function trackRepeatedQuickSkip(state: SessionState, listenedMs: number | null, energy: number | null): number | null {
  if (state.condition === "A" || listenedMs == null || listenedMs < 0 || listenedMs >= QUICK_SKIP_MAX_LISTEN_MS || energy == null) {
    state.quickSkipRun = undefined;
    return null;
  }

  const previous = state.quickSkipRun;
  state.quickSkipRun = previous?.energy === energy ? { energy, count: previous.count + 1 } : { energy, count: 1 };
  return state.quickSkipRun.count >= QUICK_SKIP_MEMORY_THRESHOLD ? energy : null;
}

function rememberRepeatedQuickSkip(deps: OrchestrationDeps, state: SessionState, energy: number): void {
  if (state.condition !== "C" || state.rememberedQuickSkipEnergies.has(energy)) return;
  state.rememberedQuickSkipEnergies.add(energy);
  void deps.memory
    .remember(
      `User repeatedly skipped energy ${energy}/5 tracks quickly during a "${state.intent.mood}" ${state.intent.scene} session; prefer a different energy level for this context.`,
      state.id,
      state.userId,
    )
    .catch(() => {});
}
