import type { RegenerateSessionResponse } from "@auracle/shared";
import type { Registration } from "../dj/registration.js";
import type { MemoryServiceClient } from "../memory-service-client.js";
import type { MusicEngineClient } from "../music-engine-client.js";
import type { ProxyClient } from "../proxy-client.js";
import { changeSessionHostMode, cueSession, markSessionNowPlaying, recordSessionClientEvent, retrySessionExtend } from "./client-controls.js";
import { createSession, type CreateSessionInput } from "./create-session.js";
import { applyPlaylistFeedback, regenerateQueue, runSessionTool } from "./interactions.js";
import type { PlaylistFeedbackOutcome } from "./playlist-feedback.js";
import { sessionInvalidationReason, sessionOwner as getSessionOwner, sessionRegistration, sessionSnapshot, type SessionSnapshot } from "./queries.js";
import type { OrchestrationDeps } from "./replan.js";
import { SessionStore } from "./store.js";
import type { ToolCall, ToolEnvelope } from "./tool-runner.js";

export interface SessionRuntimeDeps {
  store: SessionStore;
  memory: MemoryServiceClient;
  music: MusicEngineClient;
  proxy: ProxyClient;
  proxyPublicUrl: string;
  log?: { warn(payload: unknown, message?: string): void; info(payload: unknown, message?: string): void };
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
