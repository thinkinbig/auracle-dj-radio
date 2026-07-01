import type { HostMode } from "@auracle/shared";
import { parseHostMode } from "@auracle/shared";
import { buildAndPushCue } from "./cue.js";
import { extendQueue } from "./extend.js";
import { markNowPlaying } from "./now-playing.js";
import type { OrchestrationDeps } from "./replan.js";

interface ClientControlLog {
  warn(payload: unknown, message?: string): void;
  info(payload: unknown, message?: string): void;
}

export async function markSessionNowPlaying(
  deps: OrchestrationDeps,
  sessionId: string,
  trackId: string,
  log?: ClientControlLog,
): Promise<Record<string, unknown> | undefined | false> {
  const state = deps.store.get(sessionId);
  if (!state) return undefined;
  return markNowPlaying(deps, state, trackId, log);
}

export async function cueSession(
  deps: OrchestrationDeps,
  sessionId: string,
  kind: "break" | "outro",
): Promise<boolean> {
  const state = deps.store.get(sessionId);
  if (!state) return false;
  await buildAndPushCue(deps, state, kind);
  return true;
}

export async function changeSessionHostMode(
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

/** User-initiated rolling extend retry after a failed append (E6). */
export async function retrySessionExtend(
  deps: OrchestrationDeps,
  sessionId: string,
  log?: ClientControlLog,
): Promise<boolean> {
  const state = deps.store.get(sessionId);
  if (!state) return false;
  await extendQueue(deps, state, log, { force: true });
  return true;
}

export async function recordSessionClientEvent(
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
