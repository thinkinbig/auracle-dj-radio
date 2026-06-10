import type { ClientMessage } from '@auracle/shared';
import type { AudioBus } from './liveAudio';
import type { LiveSessionHandle } from './liveSession';
import type { PlaybackAction } from './playbackReducer';
import type { PlaybackState } from '../types';

type CueKind = Extract<ClientMessage, { type: 'cue_dj' }>['kind'];

/**
 * Everything the command surface needs from the live session, read lazily so a
 * single long-lived instance can be created before the bus/socket exist.
 */
export interface RadioCommandDeps {
  getState(): PlaybackState;
  dispatch(action: PlaybackAction): void;
  getBus(): AudioBus | null;
  getSocket(): LiveSessionHandle | null;
  getAudio(): HTMLAudioElement | null;
  /** Unblock the silent opening track so its music can play (CONTEXT: Playhead/opening). */
  releaseOpening(): void;
}

/**
 * The single owner of outbound DJ-turn commands. Each verb sequences the data
 * plane (AudioBus duck/skip), the transport (relay frames), and the control
 * plane (reducer) in the one order that keeps them consistent — so a caller says
 * what it wants (Cue, Skip track, Skip voice-over, talk-over) without re-deriving
 * the order at every site. Inbound phase frames are NOT handled here.
 */
export interface RadioCommands {
  /** Tell the DJ to talk over `trackIndex` (relay picks segue/outro unless overridden). */
  cueTrack(trackIndex: number, kind?: CueKind): void;
  /** Skip track: cut any in-flight DJ turn, advance the Playhead, Cue the next track. Returns whether a skip occurred. */
  skipTrack(): boolean;
  /** Skip voice-over: cut the current DJ turn but keep the track playing. */
  skipVoiceOver(): void;
  /** Begin a push-to-talk turn: duck the music and mark the listener talking. */
  startTalk(): void;
  /** End a push-to-talk turn: restore the music. */
  endTalk(): void;
  /** Read-and-clear the skip guard so the music element's `ended` can ignore the post-skip stop. */
  consumeSkipGuard(): boolean;
}

export function createRadioCommands(deps: RadioCommandDeps): RadioCommands {
  // Set when a skip pauses the music element, so the resulting `ended`/stop is not
  // mistaken for a natural track end that would double-advance.
  let skipGuard = false;

  function cueTrack(trackIndex: number, kind?: CueKind): void {
    deps.getSocket()?.send({ type: 'cue_dj', track_index: trackIndex, kind });
  }

  /** Cut the current DJ turn's audio locally and tell the relay to stop forwarding it. */
  function cutDjTurn(): void {
    deps.getBus()?.skipDj();
    deps.getSocket()?.send({ type: 'skip_dj' });
  }

  return {
    cueTrack,

    skipTrack(): boolean {
      const s = deps.getState();
      if (!s.sessionId || s.phase === 'idle' || s.phase === 'curating') return false;
      if (s.remainingTrackIds.length === 0) return false;

      skipGuard = true;
      deps.getAudio()?.pause();
      if (s.currentTrackIndex === 0) deps.releaseOpening();
      // Skipping mid voice-over: interrupt the DJ turn (saves Gemini tokens). Its
      // drained phase frames are dropped by the Playhead fence once advance moves
      // the pointer.
      if (s.phase === 'speaking') cutDjTurn();

      deps.dispatch({ type: 'advance' });
      // The skipped-to track gets its own Cue — the DJ talks over its intro
      // (segue), since skipping bypasses the end-of-track break (CONTEXT: a Skip
      // track Cues its own DJ turn; amends ADR-0004). Kind omitted → the relay
      // picks segue vs outro by position. now_playing (from useTrackPlayback)
      // mirrors the pointer.
      cueTrack(s.currentTrackIndex + 1);
      return true;
    },

    skipVoiceOver(): void {
      if (deps.getState().phase !== 'speaking') return;
      cutDjTurn();
    },

    startTalk(): void {
      const s = deps.getState();
      if (s.phase === 'idle' || s.phase === 'curating' || s.phase === 'paused' || s.isTalking) return;
      // Take the floor like Siri: silence any in-flight DJ voice instantly (local,
      // zero round-trip). The music cut + restore is owned by the duck policy,
      // which now reads isTalking — so a mid-hold phase frame can't undo it.
      deps.getBus()?.skipDj();
      deps.dispatch({ type: 'start_talk' });
    },

    endTalk(): void {
      if (!deps.getState().isTalking) return;
      // Lift the startTalk suppression here, paired with the gesture — don't wait
      // for a server dj_turn_start to resumeDj (after a barge-in that frame may
      // never come, which would mute the DJ for the rest of the session). Music
      // restore is the duck policy's job once isTalking clears.
      deps.getBus()?.resumeDj();
      deps.dispatch({ type: 'stop_talk' });
    },

    consumeSkipGuard(): boolean {
      if (!skipGuard) return false;
      skipGuard = false;
      return true;
    },
  };
}
