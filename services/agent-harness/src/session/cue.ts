import { buildCueText, toCueTrack, type CueKind } from "../dj/prompt.js";
import type { OrchestrationDeps } from "./replan.js";
import type { SessionState } from "./store.js";

/**
 * Build the between-track scene-direction cue and push it to the live session as
 * Lane-3 inject_text, so the DJ speaks the break/outro over the track tail
 * (ADR-0004). The browser owns the playhead and fires this near a track's end;
 * `now` is the current track, `next` is its successor. Replaces the relay's
 * server-side cue (refactor-three-services).
 */
export async function buildAndPushCue(
  deps: OrchestrationDeps,
  state: SessionState,
  kind: CueKind,
): Promise<void> {
  const nowId = state.tracklist[state.currentTrackIndex]?.id;
  const nextId = state.tracklist[state.currentTrackIndex + 1]?.id;
  const now = nowId ? await deps.music.getTrack(nowId) : undefined;
  const next = nextId ? await deps.music.getTrack(nextId) : undefined;
  const cueText = buildCueText({
    kind,
    hostMode: state.hostMode,
    sessionTitle: state.title,
    now: toCueTrack(now),
    next: toCueTrack(next),
    contextRotation: state.currentTrackIndex,
  });
  await deps.proxy.inject(state.id, { inject_text: cueText });
}
