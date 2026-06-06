import { useCallback, useEffect, useRef } from 'react';
import {
  musicVolume,
  shouldPlayMusic,
} from '../../lib/playbackCoordinator';
import { postSessionEvent } from '../../lib/sessionApi';
import type { PlaybackState } from '../../types';
import type { OpeningGateControls } from './useOpeningGate';
import type { SessionRefs } from './sessionRefs';

interface TrackPlaybackInput {
  refs: SessionRefs;
  state: Pick<
    PlaybackState,
    'phase' | 'currentTrackIndex' | 'sessionId' | 'trackId' | 'remainingTrackIds'
  >;
  opening: OpeningGateControls;
}

/** Music element listeners, per-track loading, duck policy, and pause/resume DJ sync. */
export function useTrackPlayback({ refs, state, opening }: TrackPlaybackInput): void {
  const { openingReleased, armForTrack } = opening;
  const prevPhaseRef = useRef(state.phase);

  const applyPlaybackPolicy = useCallback(() => {
    const bus = refs.audioBusRef.current;
    const audio = refs.audioRef.current;
    const s = refs.stateRef.current;
    if (!bus || !audio) return;

    const policy = {
      phase: s.phase,
      currentTrackIndex: s.currentTrackIndex,
      openingReleased,
    };
    bus.setMusicVolume(musicVolume(policy));
    if (s.phase === 'paused') audio.pause();
    else if (shouldPlayMusic(policy)) void audio.play().catch(() => {});
  }, [refs, openingReleased]);

  useEffect(() => {
    const audio = refs.audioRef.current ?? (refs.audioRef.current = new Audio());
    const onTime = () =>
      refs.dispatchRef.current({
        type: 'progress',
        progressSec: Math.floor(audio.currentTime),
      });
    const onMeta = () =>
      refs.dispatchRef.current({
        type: 'duration',
        durationSec: Math.floor(audio.duration),
      });
    const onEnded = () => {
      if (refs.skipGuardRef.current) {
        refs.skipGuardRef.current = false;
        return;
      }
      refs.dispatchRef.current({ type: 'advance' });
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, [refs]);

  useEffect(() => {
    if (!state.sessionId) return;

    const isOpening = state.currentTrackIndex === 0;
    armForTrack(state.currentTrackIndex);

    postSessionEvent(state.sessionId, 'track_started', { track_id: state.trackId });
    refs.liveRef.current?.send({ type: 'cue_dj', track_index: state.currentTrackIndex });

    const audio = refs.audioRef.current;
    if (audio) {
      audio.preload = 'auto';
      audio.src = `/tracks/${state.trackId}/audio`;
      audio.load();
      audio.pause();
      audio.currentTime = 0;
      if (!isOpening) void audio.play().catch(() => {});
    }

    const nextId = state.remainingTrackIds[0];
    if (nextId) {
      const pre = refs.preloadRef.current ?? (refs.preloadRef.current = new Audio());
      pre.preload = 'auto';
      pre.src = `/tracks/${nextId}/audio`;
    }

    return () => refs.openingRef.current?.dispose();
  }, [
    refs,
    state.sessionId,
    state.currentTrackIndex,
    state.trackId,
    state.remainingTrackIds,
    armForTrack,
  ]);

  useEffect(() => {
    applyPlaybackPolicy();
  }, [state.phase, state.currentTrackIndex, openingReleased, applyPlaybackPolicy]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    const bus = refs.audioBusRef.current;
    if (!bus) return;
    if (state.phase === 'paused' && prev !== 'paused') bus.skipDj();
    else if (prev === 'paused' && state.phase !== 'paused') bus.resumeDj();
  }, [refs, state.phase]);
}
