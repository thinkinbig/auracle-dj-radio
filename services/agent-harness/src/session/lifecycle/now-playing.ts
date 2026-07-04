import { buildNowPlayingContextInject } from "../../dj/prompt.js";
import { buildAndPushCue } from "../delivery/cue.js";
import { resolveCueTrack } from "../delivery/cue-track.js";
import { extendQueue } from "./extend.js";
import type { OrchestrationDeps } from "../deps.js";
import { swapNextOnQuickSkip } from "./skip-swap.js";
import type { SessionState } from "../state.js";

const QUICK_SKIP_SWAP_THRESHOLD = 2;
const QUICK_SKIP_MAX_LISTEN_MS = 60_000;

interface NowPlayingLog {
  warn(payload: unknown, message?: string): void;
  info(payload: unknown, message?: string): void;
}

interface PlayheadUpdate {
  prevIndex: number;
  prevStartedAtMs: number | undefined;
}

/**
 * Apply a browser playhead update and run the orchestration that hangs off it:
 * skip latency telemetry, quick-skip swap, now-playing context, intro
 * cues, and rolling extend. The browser remains the playhead writer; this only
 * mirrors its report into harness state.
 */
export async function markNowPlaying(
  deps: OrchestrationDeps,
  state: SessionState,
  trackId: string,
  log?: NowPlayingLog,
): Promise<Record<string, unknown> | false> {
  const update = applyPlayheadUpdate(deps, state, trackId);
  if (!update) return false;

  await settleSkipTransition(deps, state, update, log);
  startTrackSideEffects(deps, state, log);

  return nowPlayingResponse(deps, state);
}

function applyPlayheadUpdate(deps: OrchestrationDeps, state: SessionState, trackId: string): PlayheadUpdate | false {
  const prevIndex = state.currentTrackIndex;
  const prevStartedAtMs = state.trackStartedAtMs;
  if (!deps.store.markStarted(state, trackId)) return false;
  return { prevIndex, prevStartedAtMs };
}

async function settleSkipTransition(
  deps: OrchestrationDeps,
  state: SessionState,
  update: PlayheadUpdate,
  log?: NowPlayingLog,
): Promise<void> {
  if (state.pendingSkipAtMs == null || state.currentTrackIndex === update.prevIndex) return;
  await recordSkipTransition(deps, state, update.prevIndex, update.prevStartedAtMs, log);
}

function startTrackSideEffects(deps: OrchestrationDeps, state: SessionState, log?: NowPlayingLog): void {
  state.trackStartedAtMs = Date.now();
  pushNowPlayingContext(deps, state, log);
  pushIntroCue(deps, state, log);
  // Rolling extend is debounced internally and must never block now_playing.
  void extendQueue(deps, state, log);
}

function nowPlayingResponse(deps: OrchestrationDeps, state: SessionState): Record<string, unknown> {
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

  // Clear before any await so a profile-service failure cannot leak into the
  // next now_playing report.
  state.pendingSkipAtMs = undefined;
  await deps.profile
    .recordEvent(state.id, state.userId, "skip_latency", { ms, from_index: prevIndex, to_index: state.currentTrackIndex, energy })
    .catch((err) => log?.warn({ err: (err as Error).message, sessionId: state.id }, "record skip_latency failed"));

  const repeatedQuickSkipEnergy = trackRepeatedQuickSkip(state, listenedMs, energy);
  if (repeatedQuickSkipEnergy != null) {
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
  return state.quickSkipRun.count >= QUICK_SKIP_SWAP_THRESHOLD ? energy : null;
}
