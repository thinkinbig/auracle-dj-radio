import { parseHostMode, type HostMode, type PlaylistFeedbackSource, type RegenerateSessionResponse } from "@auracle/shared";
import type { Registration } from "../dj/registration.js";
import { buildAndPushCue } from "./delivery/cue.js";
import type { OrchestrationDeps, SessionLog } from "./deps.js";
import { extendQueue } from "./lifecycle/extend.js";
import { createSession, type CreateSessionInput } from "./lifecycle/create.js";
import { markNowPlaying } from "./lifecycle/now-playing.js";
import { parsePlaylistFeedback, runPlaylistFeedback, type PlaylistFeedbackOutcome } from "./planning/playlist-feedback.js";
import { sessionInvalidationReason, sessionOwner as getSessionOwner, sessionRegistration, sessionSnapshot, type SessionSnapshot } from "./queries.js";
import { runTool, type ToolCall, type ToolEnvelope } from "./tool-runner.js";

export interface SessionRuntimeDeps extends OrchestrationDeps {
  proxyPublicUrl: string;
  log?: SessionLog;
}

export interface SessionRuntime {
  createSession(input: CreateSessionInput, userId: string): Promise<Record<string, unknown>>;
  sessionOwner(id: string): string | undefined;
  invalidationReason(id: string): string | undefined;
  sessionSnapshot(id: string): SessionSnapshot | undefined;
  registration(id: string): Promise<Registration | undefined>;
  runTool(id: string, call: ToolCall): Promise<ToolEnvelope | undefined>;
  playlistFeedback(id: string, feedback: unknown): Promise<PlaylistFeedbackOutcome | undefined | false>;
  markNowPlaying(id: string, trackId: string): Promise<Record<string, unknown> | undefined | false>;
  cue(id: string, kind: "break" | "outro"): Promise<boolean>;
  changeHostMode(id: string, rawMode: unknown): Promise<Record<string, unknown> | undefined | false>;
  regenerateQueue(id: string): Promise<RegenerateSessionResponse | undefined>;
  retryExtend(id: string): Promise<boolean>;
  recordClientEvent(id: string, eventType: string, payload: unknown): Promise<boolean>;
}

export function createSessionRuntime(deps: SessionRuntimeDeps): SessionRuntime {
  const orchestration: OrchestrationDeps = {
    store: deps.store,
    memory: deps.memory,
    music: deps.music,
    proxy: deps.proxy,
  };

  return {
    createSession(input, userId) {
      return createSession({ ...orchestration, proxyPublicUrl: deps.proxyPublicUrl, log: deps.log }, input, userId);
    },
    sessionOwner(id) {
      return getSessionOwner(deps, id);
    },
    invalidationReason(id) {
      return sessionInvalidationReason(deps, id);
    },
    sessionSnapshot(id) {
      return sessionSnapshot(deps, id);
    },
    registration(id) {
      return sessionRegistration(deps, id);
    },
    runTool(id, call) {
      return runSessionTool(orchestration, id, call);
    },
    playlistFeedback(id, feedback) {
      return applyPlaylistFeedback(orchestration, id, feedback, "ui");
    },
    markNowPlaying(id, trackId) {
      return markSessionNowPlaying(orchestration, id, trackId, deps.log);
    },
    cue(id, kind) {
      return cueSession(orchestration, id, kind);
    },
    changeHostMode(id, rawMode) {
      return changeSessionHostMode(orchestration, id, rawMode);
    },
    regenerateQueue(id) {
      return regenerateQueue(orchestration, id);
    },
    retryExtend(id) {
      return retrySessionExtend(orchestration, id, deps.log);
    },
    recordClientEvent(id, eventType, payload) {
      return recordSessionClientEvent(orchestration, id, eventType, payload);
    },
  };
}

async function runSessionTool(
  deps: OrchestrationDeps,
  sessionId: string,
  call: ToolCall,
): Promise<ToolEnvelope | undefined> {
  const state = deps.store.get(sessionId);
  if (!state) return undefined;
  return runTool(deps, state, call);
}

async function applyPlaylistFeedback(
  deps: OrchestrationDeps,
  sessionId: string,
  feedback: unknown,
  source: PlaylistFeedbackSource,
): Promise<PlaylistFeedbackOutcome | undefined | false> {
  const state = deps.store.get(sessionId);
  if (!state) return undefined;
  const parsed = parsePlaylistFeedback(feedback);
  if (!parsed) return false;
  return runPlaylistFeedback(deps, state, parsed, source);
}

async function regenerateQueue(deps: OrchestrationDeps, sessionId: string): Promise<RegenerateSessionResponse | undefined> {
  const outcome = await applyPlaylistFeedback(deps, sessionId, "regenerate", "ui");
  if (!outcome) return undefined;
  return outcome.regenerate;
}

async function markSessionNowPlaying(
  deps: OrchestrationDeps,
  sessionId: string,
  trackId: string,
  log?: SessionLog,
): Promise<Record<string, unknown> | undefined | false> {
  const state = deps.store.get(sessionId);
  if (!state) return undefined;
  return markNowPlaying(deps, state, trackId, log);
}

async function cueSession(deps: OrchestrationDeps, sessionId: string, kind: "break" | "outro"): Promise<boolean> {
  const state = deps.store.get(sessionId);
  if (!state) return false;
  await buildAndPushCue(deps, state, kind);
  return true;
}

async function changeSessionHostMode(
  deps: OrchestrationDeps,
  sessionId: string,
  rawMode: unknown,
): Promise<Record<string, unknown> | undefined | false> {
  const state = deps.store.get(sessionId);
  if (!state) return undefined;
  const nextMode = parseHostMode(rawMode);
  if (!nextMode) return false;
  const previous: HostMode = state.hostMode;
  const changed = nextMode !== previous;
  if (changed) {
    state.hostMode = nextMode;
    await deps.memory.recordEvent(sessionId, state.userId, "change_host_mode", { host_mode: nextMode, previous, source: "ui" });
    await deps.proxy.inject(sessionId, {
      inject_text: `[host mode → ${nextMode}] Adopt this speaking style from your next line; don't announce the switch. Playlist unchanged.`,
    });
  }
  return { ok: true, host_mode: nextMode, previous, changed };
}

async function retrySessionExtend(deps: OrchestrationDeps, sessionId: string, log?: SessionLog): Promise<boolean> {
  const state = deps.store.get(sessionId);
  if (!state) return false;
  await extendQueue(deps, state, log, { force: true });
  return true;
}

async function recordSessionClientEvent(
  deps: OrchestrationDeps,
  sessionId: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  const state = deps.store.get(sessionId);
  if (!state) return false;
  await deps.memory.recordEvent(sessionId, state.userId, eventType, payload ?? {});
  return true;
}
