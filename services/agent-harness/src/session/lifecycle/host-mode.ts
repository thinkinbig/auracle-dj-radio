import type { HostMode } from "@auracle/shared";
import type { OrchestrationDeps } from "../deps.js";
import type { SessionState } from "../state.js";

export type HostModeSource = "ui" | "dj_tool";

export interface HostModeChangeResult {
  ok: true;
  host_mode: HostMode;
  previous: HostMode;
  changed: boolean;
  /** DJ tool note when changed; UI relies on proxy inject instead. */
  note?: string;
}

const HOST_MODE_SWITCH_INSTRUCTION: Record<HostMode, string> = {
  curator: "Warm curator. Brief context is okay.",
  set_dj: "Cool, music-first, one sentence max.",
  hype: "High energy, short imperatives, no shouting.",
  roast: "Playful roast host: witty and music-specific, never cruel or personal.",
};

/** Shared host-mode mutation for UI HTTP and DJ tool paths. */
export async function changeHostMode(
  deps: OrchestrationDeps,
  state: SessionState,
  nextMode: HostMode,
  source: HostModeSource,
): Promise<HostModeChangeResult> {
  const previous = state.hostMode;
  if (nextMode === previous) {
    return { ok: true, host_mode: previous, previous, changed: false };
  }

  state.hostMode = nextMode;
  await deps.memory.recordEvent(state.id, state.userId, "change_host_mode", {
    host_mode: nextMode,
    previous,
    ...(source === "ui" ? { source: "ui" } : {}),
  });

  if (source === "ui") {
    await deps.proxy.inject(state.id, {
      inject_text: `[host mode -> ${nextMode}] ${HOST_MODE_SWITCH_INSTRUCTION[nextMode]} Adopt this speaking style from your next line; don't announce the switch. Playlist unchanged.`,
    });
  }

  return {
    ok: true,
    host_mode: nextMode,
    previous,
    changed: true,
    note: source === "dj_tool" ? `${HOST_MODE_SWITCH_INSTRUCTION[nextMode]} Playlist unchanged.` : undefined,
  };
}
