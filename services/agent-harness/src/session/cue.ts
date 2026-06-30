import { buildCueText, type CueKind } from "../dj/prompt.js";
import { resolveCueTrack } from "./cue-track.js";
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
  const now = await resolveCueTrack(deps.music, state, state.tracklist[state.currentTrackIndex]);
  const next = await resolveCueTrack(deps.music, state, state.tracklist[state.currentTrackIndex + 1]);
  const cueText = buildCueText({
    kind,
    hostMode: state.hostMode,
    sessionTitle: state.title,
    now,
    next,
    contextRotation: state.currentTrackIndex,
  });
  await deps.proxy.inject(state.id, { inject_text: cueText });
}
