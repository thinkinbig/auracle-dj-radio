import type { ServerMessage, SkipTrackSource } from "@auracle/shared";
import type { OrchestrationDeps } from "../deps.js";
import type { SessionState } from "../state.js";

export const SKIP_ONLY_TOOL_GUARD_MS = 1_500;

export interface SkipTrackOutcome {
  gemini_result: Record<string, unknown>;
  ui_events: ServerMessage[];
}

/** Single server path for skip track — UI HTTP and DJ tool. */
export async function runSkipTrack(
  deps: OrchestrationDeps,
  state: SessionState,
  source: SkipTrackSource,
  trackId?: string | null,
): Promise<SkipTrackOutcome> {
  const skippedTrackId = trackId ?? state.tracklist[state.currentTrackIndex]?.id ?? null;
  await deps.memory.recordEvent(state.id, state.userId, "skip_track", {
    source,
    track_id: skippedTrackId,
  });
  // Browser is the sole playhead writer: stamp the start so the next now_playing
  // can time the skip round trip and run quick-skip learning.
  const now = Date.now();
  state.pendingSkipAtMs = now;
  state.skipOnlyUntilMs = now + SKIP_ONLY_TOOL_GUARD_MS;
  return {
    gemini_result: { ok: true },
    ui_events: source === "dj_tool" ? [{ type: "intent", intent: { type: "skip_track" } }] : [],
  };
}
