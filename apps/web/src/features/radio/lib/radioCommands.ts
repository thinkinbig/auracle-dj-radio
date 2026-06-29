import type { AudioBus } from './liveAudio';
import type { LiveRtcHandle } from './liveSessionRtc';
import { postCue } from './sessionApi';
import type { PlaybackAction } from '../session/playbackReducer';
import type { PlaybackState } from '@/features/radio/session/types';
import {
  isSpotifyPlaybackEnabled,
  pauseSpotifyPlayback,
  setSpotifyVolume,
} from '@/features/spotify/spotifyPlayback';

/** End-of-track cue kinds the browser can request (memory-service builds the text). */
type CueKind = 'break' | 'outro';

/**
 * Everything the command surface needs from the live session, read lazily so a
 * single long-lived instance can be created before the bus exists.
 */
export interface RadioCommandDeps {
  getState(): PlaybackState;
  dispatch(action: PlaybackAction): void;
  getBus(): AudioBus | null;
  getAudio(): HTMLAudioElement | null;
  /** The live transport handle (null before connect / in demo fallback). */
  getLive(): LiveRtcHandle | null;
  /** Unblock the silent opening track so its music can play (CONTEXT: Playhead/opening). */
  releaseOpening(): void;
}

/**
 * The single owner of outbound DJ-turn commands. Each verb sequences the data
 * plane (AudioBus duck/skip), the orchestrator (memory-service HTTP cue), and the
 * control plane (reducer) in the one order that keeps them consistent — so a
 * caller says what it wants (Cue, Skip track, Skip voice-over, talk-over) without
 * re-deriving the order at every site. Inbound phase frames are NOT handled here.
 */
export interface RadioCommands {
  /** Ask memory-service to push an end-of-track DJ cue (it targets the mirrored playhead). */
  cueTrack(kind: CueKind): void;
  /** Skip track: cut any in-flight DJ turn and advance the Playhead. Returns whether a skip occurred. */
  skipTrack(): boolean;
  /** Skip voice-over: cut the current DJ turn but keep the track playing. */
  skipVoiceOver(): void;
  /** Begin a push-to-talk turn: duck the music and mark the listener talking. */
  startTalk(): void;
  /** End a push-to-talk turn: restore the music. */
  endTalk(): void;
  /** Barge in with a typed message: cut any in-flight DJ turn and send user text to the model. */
  sendText(text: string): void;
  /** Read-and-clear the skip guard so the music element's `ended` can ignore the post-skip stop. */
  consumeSkipGuard(): boolean;
}

export function createRadioCommands(deps: RadioCommandDeps): RadioCommands {
  // Set when a skip pauses the music element, so the resulting `ended`/stop is not
  // mistaken for a natural track end that would double-advance.
  let skipGuard = false;

  function cueTrack(kind: CueKind): void {
    const id = deps.getState().sessionId;
    if (id) postCue(id, kind);
  }

  // Cut the current DJ turn locally by ducking the DJ gain. There is no control
  // frame to the proxy: the WebRTC DJ stream is continuous, and non-tool-result
  // text on the data channel would be heard by the model as user speech.
  function cutDjTurn(): void {
    deps.getBus()?.skipDj();
  }

  return {
    cueTrack,

    skipTrack(): boolean {
      const s = deps.getState();
      if (!s.sessionId || s.phase === 'idle' || s.phase === 'curating') return false;
      if (s.remainingTrackIds.length === 0) return false;

      skipGuard = true;
      deps.getAudio()?.pause();
      if (isSpotifyPlaybackEnabled()) void pauseSpotifyPlayback();
      if (s.currentTrackIndex === 0) deps.releaseOpening();
      // Skipping mid voice-over: duck the DJ locally. now_playing (from
      // useTrackPlayback's track-change effect) mirrors the new pointer to
      // memory-service; the new track gets its own end-of-track break cue later.
      if (s.phase === 'speaking') cutDjTurn();

      deps.dispatch({ type: 'advance' });
      return true;
    },

    skipVoiceOver(): void {
      if (deps.getState().phase !== 'speaking') return;
      cutDjTurn();
    },

    startTalk(): void {
      const s = deps.getState();
      if (s.phase === 'idle' || s.phase === 'curating' || s.isTalking) return;
      // Take the floor like Siri: silence any in-flight DJ voice instantly (local,
      // zero round-trip). The music cut + restore is owned by the duck policy,
      // which now reads isTalking — so a mid-hold phase frame can't undo it.
      deps.getBus()?.skipDj();
      if (isSpotifyPlaybackEnabled()) void setSpotifyVolume(0);
      deps.dispatch({ type: 'start_talk' });
    },

    endTalk(): void {
      if (!deps.getState().isTalking) return;
      // Lift the startTalk suppression here, paired with the gesture — don't wait
      // for a server dj_turn_start to resumeDj (after a barge-in that frame may
      // never come, which would mute the DJ for the rest of the session). Music
      // restore is the duck policy's job once isTalking clears.
      deps.getBus()?.resumeDj();
      if (isSpotifyPlaybackEnabled()) void setSpotifyVolume(1);
      deps.dispatch({ type: 'stop_talk' });
    },

    sendText(text: string): void {
      const s = deps.getState();
      if (s.phase === 'idle' || s.phase === 'curating') return;
      const trimmed = text.trim();
      if (!trimmed) return;
      // Barge in like push-to-talk: silence any in-flight DJ voice instantly
      // (local, zero round-trip), then deliver the typed message to the model as
      // a user turn over the data channel.
      deps.getBus()?.skipDj();
      if (isSpotifyPlaybackEnabled()) void setSpotifyVolume(0.25);
      deps.getLive()?.sendText(trimmed);
      // Echo into the transcript ourselves: unlike mic audio, typed text isn't
      // transcribed back by the model, so this is the only record of the turn.
      deps.dispatch({ type: 'transcript', role: 'user', text: trimmed });
    },

    consumeSkipGuard(): boolean {
      if (!skipGuard) return false;
      skipGuard = false;
      return true;
    },
  };
}
