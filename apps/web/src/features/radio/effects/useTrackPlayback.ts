import { useCallback, useEffect, useRef } from 'react';
import {
  musicVolume,
  shouldPlayMusic,
  TALK_WINDOW,
} from '../lib/playbackCoordinator';
import { postNowPlaying, postSessionEvent } from '../lib/sessionApi';
import { createLocalPlayer } from '../playback/LocalPlayer';
import { createSpotifyPlayer } from '../playback/SpotifyPlayer';
import { backendForUri, type Backend, type MusicPlayer, type MusicPlayerCallbacks, type PlayableTrack } from '../playback/MusicPlayer';
import type { RadioCommands } from '../lib/radioCommands';
import type { PlaybackState } from '@/features/radio/session/types';
import type { OpeningGateControls } from './useOpeningGate';
import type { AudioRefs, StoreRefs } from './sessionRefs';

interface TrackPlaybackInput {
  store: StoreRefs;
  audio: AudioRefs;
  commands: RadioCommands;
  state: Pick<
    PlaybackState,
    'phase' | 'currentTrackIndex' | 'sessionId' | 'trackId' | 'remainingTrackIds' | 'sessionTracklist'
  >;
  opening: OpeningGateControls;
}

type TrackLoadState = Pick<PlaybackState, 'sessionId' | 'currentTrackIndex' | 'trackId' | 'sessionTracklist'>;

/** Resolve a slot's backend from its uri scheme; absent slot means local. ADR-0005. */
function playableUriAt(state: Pick<PlaybackState, 'sessionTracklist'>, index: number, fallbackId: string | undefined): string {
  return state.sessionTracklist[index]?.uri ?? (fallbackId ? `local:${fallbackId}` : 'local:');
}

function backendAt(state: Pick<PlaybackState, 'sessionTracklist'>, index: number, fallbackId?: string): Backend {
  return backendForUri(playableUriAt(state, index, fallbackId));
}

export function trackLoadKey(state: TrackLoadState): string | null {
  if (!state.sessionId) return null;
  return [
    state.sessionId,
    state.currentTrackIndex,
    state.trackId,
    playableUriAt(state, state.currentTrackIndex, state.trackId),
  ].join(':');
}

/**
 * Per-track loading, duck policy, and pause/resume DJ sync — delegated to a
 * `MusicPlayer` chosen by the slot's uri scheme (ADR-0005 §6). The talk-window break,
 * the advance, and the DJ-voice duck stay here; only the music transport moves
 * into the player.
 */
export function useTrackPlayback({ store, audio, commands, state, opening }: TrackPlaybackInput): void {
  const { openingReleased, isOpeningReleased, armForTrack } = opening;
  const nextTrackId = state.remainingTrackIds[0];
  const currentUri = playableUriAt(state, state.currentTrackIndex, state.trackId);
  const nextUri = playableUriAt(state, state.currentTrackIndex + 1, nextTrackId);
  const currentSource = backendAt(state, state.currentTrackIndex, state.trackId);
  const nextSource = backendAt(state, state.currentTrackIndex + 1, nextTrackId);
  const currentTrackLoadKey = trackLoadKey(state);
  const prevPhaseRef = useRef(state.phase);
  // Track index we've already fired an end-of-track cue for, so the final-seconds
  // trigger runs once per track (ADR-0004).
  const cuedTrackRef = useRef(-1);
  // One player per backend, instantiated once and kept warm for the session.
  const playersRef = useRef<Partial<Record<Backend, MusicPlayer>>>({});

  // Final-seconds talk break: the DJ wraps over the track tail, then a listening
  // window opens (ADR-0004). The window — not `ended` — drives the advance.
  const maybeTriggerBreak = useCallback(
    (currentSec: number, durationSec: number) => {
      const s = store.stateRef.current;
      if (s.inBreak || s.phase !== 'playing') return;
      if (cuedTrackRef.current === s.currentTrackIndex) return;
      if (!Number.isFinite(durationSec) || durationSec <= 0) return;
      if (currentSec < durationSec - TALK_WINDOW.leadSec) return;

      cuedTrackRef.current = s.currentTrackIndex;
      const hasNext = s.remainingTrackIds.length > 0;
      // Only a track with a successor opens a window; the final track just plays
      // out under the outro.
      if (hasNext) store.dispatchRef.current({ type: 'enter_break' });
      commands.cueTrack(hasNext ? 'break' : 'outro');
    },
    [store, commands],
  );

  const maybeAdvanceAtEnd = useCallback(() => {
    if (commands.consumeSkipGuard()) return;
    // In a break where the DJ actually engaged (phase moved off 'playing'), the
    // listening window owns the advance. If the DJ never started by the time the
    // track ends (Live down / demo fallback), advance normally rather than
    // stalling until the hard cap.
    const s = store.stateRef.current;
    if (s.inBreak && s.phase !== 'playing') return;
    store.dispatchRef.current({ type: 'advance' });
  }, [store, commands]);

  // Latest callbacks behind a stable ref so each player is created exactly once.
  const callbacksRef = useRef<MusicPlayerCallbacks>({
    onProgress: () => {},
    onDuration: () => {},
    onEnded: () => {},
  });
  callbacksRef.current = {
    onProgress: (currentSec, durationSec) => {
      store.dispatchRef.current({ type: 'progress', progressSec: Math.floor(currentSec) });
      maybeTriggerBreak(currentSec, durationSec);
    },
    onDuration: (durationSec) => {
      store.dispatchRef.current({ type: 'duration', durationSec: Math.floor(durationSec) });
    },
    onEnded: () => maybeAdvanceAtEnd(),
  };

  // Instantiate players once; dispose on unmount. The callbacks indirect through
  // the ref so the player instances never need to be rebuilt.
  useEffect(() => {
    const stableCb: MusicPlayerCallbacks = {
      onProgress: (c, d) => callbacksRef.current.onProgress(c, d),
      onDuration: (d) => callbacksRef.current.onDuration(d),
      onEnded: () => callbacksRef.current.onEnded(),
    };
    const players = playersRef.current;
    players.local = createLocalPlayer(audio, stableCb);
    players.spotify = createSpotifyPlayer(stableCb);
    return () => {
      Object.values(players).forEach((p) => p?.dispose());
      playersRef.current = {};
    };
  }, [audio]);

  const applyPlaybackPolicy = useCallback(() => {
    const s = store.stateRef.current;
    const player = playersRef.current[backendAt(s, s.currentTrackIndex)];
    if (!player) return;

    const policy = {
      phase: s.phase,
      currentTrackIndex: s.currentTrackIndex,
      openingReleased: isOpeningReleased(),
    };
    player.setMusicVolume(musicVolume(policy));
    if (s.phase === 'paused') player.pause();
    else if (shouldPlayMusic(policy)) player.resume();
  }, [store, isOpeningReleased]);

  useEffect(() => {
    if (!state.sessionId || !currentTrackLoadKey) return;

    const isOpening = state.currentTrackIndex === 0;
    armForTrack(state.currentTrackIndex);

    postSessionEvent(state.sessionId, 'track_started', { track_id: state.trackId });
    // The browser owns the Playhead; mirror it to the session orchestrator over HTTP so
    // cues/replan target the right track (CONTEXT: Playhead). The event above is
    // analytics only and no longer moves the server pointer.
    postNowPlaying(state.sessionId, state.trackId);
    // No start-of-track cue: the DJ now speaks at the END of each track (ADR-0004).
    // Track 0's opening greeting is auto-cued by the proxy on connect.

    // Hand off cleanly: stop whatever the other backend was doing before the active
    // one loads, so a local↔Spotify switch never leaves two sources live.
    const players = playersRef.current;
    for (const [src, p] of Object.entries(players)) {
      if (src !== currentSource) p?.pause();
    }
    players[currentSource]?.load(
      { id: state.trackId, uri: currentUri },
      { autostart: !isOpening },
    );
  }, [
    store,
    audio,
    state.sessionId,
    state.currentTrackIndex,
    state.trackId,
    currentTrackLoadKey,
    currentSource,
    currentUri,
    armForTrack,
  ]);

  useEffect(() => {
    if (!state.sessionId || !nextTrackId) return;
    const track: PlayableTrack = { id: nextTrackId, uri: nextUri };
    playersRef.current[nextSource]?.preload(track);
  }, [state.sessionId, nextTrackId, nextUri, nextSource]);

  useEffect(() => {
    applyPlaybackPolicy();
  }, [state.phase, state.currentTrackIndex, openingReleased, applyPlaybackPolicy]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    const bus = audio.audioBusRef.current;
    if (!bus) return;
    if (state.phase === 'paused' && prev !== 'paused') bus.skipDj();
    else if (prev === 'paused' && state.phase !== 'paused') bus.resumeDj();
  }, [audio, state.phase]);
}
