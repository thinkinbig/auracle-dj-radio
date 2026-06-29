import { useCallback, useEffect, useRef } from 'react';
import {
  musicVolume,
  shouldPlayMusic,
  TALK_WINDOW,
} from '../lib/playbackCoordinator';
import { postNowPlaying, postSessionEvent } from '../lib/sessionApi';
import { getTrackMeta } from '@/data/trackCatalog';
import {
  getSpotifyPlaybackSnapshot,
  pauseSpotifyPlayback,
  playTrackOnSpotify,
  playSpotifyQueueTrack,
  resumeSpotifyPlayback,
  setSpotifyVolume,
  type SpotifyQueueTrack,
} from '@/features/spotify/spotifyPlayback';
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
    'phase' | 'currentTrackIndex' | 'sessionId' | 'trackId' | 'remainingTrackIds' | 'isTalking'
  >;
  opening: OpeningGateControls;
  spotifyEnabled: boolean;
  spotifyQueue: SpotifyQueueTrack[];
}

/** Music element listeners, per-track loading, duck policy, and pause/resume DJ sync. */
export function useTrackPlayback({ store, audio, commands, state, opening, spotifyEnabled, spotifyQueue }: TrackPlaybackInput): void {
  const { openingReleased, armForTrack } = opening;
  const nextTrackId = state.remainingTrackIds[0];
  const prevPhaseRef = useRef(state.phase);
  // Track index we've already fired an end-of-track cue for, so the final-seconds
  // trigger runs once per track (ADR-0004).
  const cuedTrackRef = useRef(-1);
  const spotifyEndedTrackRef = useRef(-1);
  // Private to this hook: the hidden element that prefetches the next track's audio.
  const preloadRef = useRef<HTMLAudioElement | null>(null);

  const applyPlaybackPolicy = useCallback(() => {
    const bus = audio.audioBusRef.current;
    const el = audio.audioRef.current;
    const s = store.stateRef.current;
    if (!bus || !el) return;

    const policy = {
      phase: s.phase,
      currentTrackIndex: s.currentTrackIndex,
      openingReleased,
      isTalking: s.isTalking,
    };
    if (spotifyEnabled) {
      const volume = musicVolume(policy);
      void setSpotifyVolume(volume);
      if (s.phase === 'paused') void pauseSpotifyPlayback();
      else if (shouldPlayMusic(policy)) void resumeSpotifyPlayback();
      return;
    }
    // Snap the music away fast when the listener grabs the floor; otherwise the
    // default talk-over fade.
    bus.setMusicVolume(musicVolume(policy), s.isTalking ? 0.12 : undefined);
    if (s.phase === 'paused') el.pause();
    else if (shouldPlayMusic(policy)) void el.play().catch(() => {});
  }, [store, audio, openingReleased, spotifyEnabled]);

  // Final-seconds talk break: the DJ wraps over the track tail, then a listening
  // window opens (ADR-0004). The window — not `ended` — drives the advance.
  const maybeTriggerBreak = useCallback(
    (currentTime: number, duration: number) => {
      const s = store.stateRef.current;
      if (s.inBreak || s.phase !== 'playing') return;
      if (cuedTrackRef.current === s.currentTrackIndex) return;
      if (!Number.isFinite(duration) || duration <= 0) return;
      if (currentTime < duration - TALK_WINDOW.leadSec) return;

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
    const s = store.stateRef.current;
    if (s.inBreak && s.phase !== 'playing') return;
    store.dispatchRef.current({ type: 'advance' });
  }, [store, commands]);

  useEffect(() => {
    const el = audio.audioRef.current ?? (audio.audioRef.current = new Audio());
    const onTime = () => {
      if (spotifyEnabled) return;
      store.dispatchRef.current({
        type: 'progress',
        progressSec: Math.floor(el.currentTime),
      });
      maybeTriggerBreak(el.currentTime, el.duration);
    };
    const onMeta = () =>
      store.dispatchRef.current({
        type: 'duration',
        durationSec: Math.floor(el.duration),
      });
    const onEnded = () => maybeAdvanceAtEnd();
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnded);
      el.pause();
    };
  }, [store, audio, spotifyEnabled, maybeTriggerBreak, maybeAdvanceAtEnd]);

  useEffect(() => {
    if (!spotifyEnabled || !state.sessionId) return;
    let disposed = false;
    const timer = window.setInterval(() => {
      void getSpotifyPlaybackSnapshot().then((snapshot) => {
        if (disposed || !snapshot) return;
        const progressSec = Math.floor(snapshot.progressMs / 1000);
        const durationSec = Math.floor(snapshot.durationMs / 1000);
        store.dispatchRef.current({ type: 'progress', progressSec });
        store.dispatchRef.current({ type: 'duration', durationSec });
        maybeTriggerBreak(progressSec, durationSec);
        const s = store.stateRef.current;
        if (
          durationSec > 0
          && progressSec >= Math.max(0, durationSec - 1)
          && s.phase !== 'paused'
          && spotifyEndedTrackRef.current !== s.currentTrackIndex
        ) {
          spotifyEndedTrackRef.current = s.currentTrackIndex;
          maybeAdvanceAtEnd();
        }
      });
    }, 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [spotifyEnabled, state.sessionId, store, maybeTriggerBreak, maybeAdvanceAtEnd]);

  useEffect(() => {
    if (!state.sessionId) return;

    const isOpening = state.currentTrackIndex === 0;
    spotifyEndedTrackRef.current = -1;
    armForTrack(state.currentTrackIndex);

    postSessionEvent(state.sessionId, 'track_started', { track_id: state.trackId });
    // The browser owns the Playhead; mirror it to memory-service over HTTP so
    // cues/replan target the right track (CONTEXT: Playhead). The event above is
    // analytics only and no longer moves the server pointer.
    postNowPlaying(state.sessionId, state.trackId);
    // No start-of-track cue: the DJ now speaks at the END of each track (ADR-0004).
    // Track 0's opening greeting is auto-cued by the proxy on connect.

    const el = audio.audioRef.current;
    if (spotifyEnabled) {
      if (el) {
        el.pause();
        el.removeAttribute('src');
      }
      if (!isOpening) {
        const spotifyTrack = spotifyQueue[state.currentTrackIndex];
        void (spotifyTrack ? playSpotifyQueueTrack(spotifyTrack) : playTrackOnSpotify(getTrackMeta(state.trackId)));
      } else {
        void pauseSpotifyPlayback();
      }
      return;
    }

    if (el) {
      el.preload = 'auto';
      el.src = `/tracks/${state.trackId}/audio`;
      el.load();
      el.pause();
      el.currentTime = 0;
      if (!isOpening) void el.play().catch(() => {});
    }
  }, [
    store,
    audio,
    state.sessionId,
    state.currentTrackIndex,
    state.trackId,
    armForTrack,
    spotifyEnabled,
    spotifyQueue,
  ]);

  useEffect(() => {
    if (!spotifyEnabled || !state.sessionId || state.currentTrackIndex !== 0 || !openingReleased) return;
    if (state.phase === 'paused' || state.phase === 'idle' || state.phase === 'curating') return;
    const spotifyTrack = spotifyQueue[state.currentTrackIndex];
    void (spotifyTrack ? playSpotifyQueueTrack(spotifyTrack) : playTrackOnSpotify(getTrackMeta(state.trackId)));
  }, [spotifyEnabled, spotifyQueue, state.sessionId, state.currentTrackIndex, state.trackId, state.phase, openingReleased]);

  useEffect(() => {
    if (spotifyEnabled || !state.sessionId || !nextTrackId) return;
    const pre = preloadRef.current ?? (preloadRef.current = new Audio());
    pre.preload = 'auto';
    pre.src = `/tracks/${nextTrackId}/audio`;
  }, [spotifyEnabled, state.sessionId, nextTrackId]);

  useEffect(() => {
    applyPlaybackPolicy();
  }, [state.phase, state.currentTrackIndex, state.isTalking, openingReleased, applyPlaybackPolicy]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    const bus = audio.audioBusRef.current;
    if (!bus) return;
    if (state.phase === 'paused' && prev !== 'paused') bus.skipDj();
    else if (prev === 'paused' && state.phase !== 'paused') bus.resumeDj();
  }, [audio, state.phase]);
}
