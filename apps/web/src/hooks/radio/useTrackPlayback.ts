import { useCallback, useEffect, useRef } from 'react';
import {
  musicVolume,
  shouldPlayMusic,
  TALK_WINDOW,
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
  // Track index we've already fired an end-of-track cue for, so the final-seconds
  // trigger runs once per track (ADR-0004).
  const cuedTrackRef = useRef(-1);

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

  // Final-seconds talk break: the DJ wraps over the track tail, then a listening
  // window opens (ADR-0004). The window — not `ended` — drives the advance.
  const maybeTriggerBreak = useCallback(
    (audio: HTMLAudioElement) => {
      const s = refs.stateRef.current;
      if (s.inBreak || s.phase !== 'playing') return;
      if (cuedTrackRef.current === s.currentTrackIndex) return;
      const dur = audio.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      if (audio.currentTime < dur - TALK_WINDOW.leadSec) return;

      cuedTrackRef.current = s.currentTrackIndex;
      const hasNext = s.remainingTrackIds.length > 0;
      // Only a track with a successor opens a window; the final track just plays
      // out under the outro.
      if (hasNext) refs.dispatchRef.current({ type: 'enter_break' });
      refs.liveRef.current?.send({
        type: 'cue_dj',
        track_index: s.currentTrackIndex,
        kind: hasNext ? 'break' : 'outro',
      });
    },
    [refs],
  );

  useEffect(() => {
    const audio = refs.audioRef.current ?? (refs.audioRef.current = new Audio());
    const onTime = () => {
      refs.dispatchRef.current({
        type: 'progress',
        progressSec: Math.floor(audio.currentTime),
      });
      maybeTriggerBreak(audio);
    };
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
      // In a break where the DJ actually engaged (phase moved off 'playing'),
      // the listening window owns the advance. If the DJ never started by the
      // time the track ends (Live down / demo fallback), advance normally rather
      // than stalling until the hard cap.
      const s = refs.stateRef.current;
      if (s.inBreak && s.phase !== 'playing') return;
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
  }, [refs, maybeTriggerBreak]);

  useEffect(() => {
    if (!state.sessionId) return;

    const isOpening = state.currentTrackIndex === 0;
    armForTrack(state.currentTrackIndex);

    postSessionEvent(state.sessionId, 'track_started', { track_id: state.trackId });
    // The browser owns the Playhead; mirror it to the relay over the live socket so
    // cues/replan target the right track (CONTEXT: Playhead). The event above is
    // analytics only and no longer moves the server pointer.
    refs.liveRef.current?.send({ type: 'now_playing', track_index: state.currentTrackIndex });
    // No start-of-track cue: the DJ now speaks at the END of each track (ADR-0004).
    // Track 0's opening greeting is auto-cued by the relay on connect.

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
