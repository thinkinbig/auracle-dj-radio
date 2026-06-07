import { useCallback } from 'react';
import type { Dispatch } from 'react';
import type { HostMode, SessionIntent } from '@auracle/shared';
import { createAudioBus } from '../../lib/liveAudio';
import { createSession, postHostMode, postSessionEvent } from '../../lib/sessionApi';
import { prefetchTracks } from '../../lib/trackCatalog';
import type { PlaybackAction } from '../../lib/playbackReducer';
import type { OpeningGateControls } from './useOpeningGate';
import type { SessionRefs } from './sessionRefs';

export interface RadioHandlers {
  handleStart: (intent: SessionIntent) => Promise<void>;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleSkipDj: () => void;
  handleContinue: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
  handleTalkStart: () => void;
  handleTalkEnd: () => void;
}

interface RadioHandlersInput {
  refs: SessionRefs;
  dispatch: Dispatch<PlaybackAction>;
  opening: Pick<OpeningGateControls, 'releaseOpening'>;
  setAnalyser: (analyser: AnalyserNode | null) => void;
}

export function useRadioHandlers({
  refs,
  dispatch,
  opening,
  setAnalyser,
}: RadioHandlersInput): RadioHandlers {
  const { releaseOpening } = opening;

  const handleStart = useCallback(async (intent: SessionIntent) => {
    const audio = refs.audioRef.current ?? (refs.audioRef.current = new Audio());
    if (!refs.audioBusRef.current) {
      const bus = createAudioBus();
      bus.attachMusicElement(audio);
      refs.audioBusRef.current = bus;
      setAnalyser(bus.getAnalyser());
    }
    await refs.audioBusRef.current.resume();
    dispatch({ type: 'begin' });
    const session = await createSession(intent);
    void prefetchTracks(session.tracklist.map((t) => t.id));
    dispatch({ type: 'start', session });
  }, [refs, dispatch, setAnalyser]);

  const handleTogglePause = useCallback(() => {
    // Pausing during a talk break closes the window (mic off via the listening
    // gate) and advances, landing paused on the next track (ADR-0004).
    if (refs.stateRef.current.inBreak) {
      refs.dispatchRef.current({ type: 'advance' });
      refs.dispatchRef.current({ type: 'set_playback', paused: true });
      return;
    }
    dispatch({ type: 'toggle_pause' });
  }, [refs, dispatch]);

  // "Continue ▶": end the talk break now and move to the next track.
  const handleContinue = useCallback(() => {
    if (!refs.stateRef.current.inBreak) return;
    refs.dispatchRef.current({ type: 'advance' });
  }, [refs]);

  const handleSkipTrack = useCallback(() => {
    const s = refs.stateRef.current;
    if (!s.sessionId || s.phase === 'idle' || s.phase === 'curating') return;
    if (s.remainingTrackIds.length === 0) return;

    refs.skipGuardRef.current = true;
    refs.audioRef.current?.pause();
    if (s.currentTrackIndex === 0) releaseOpening();
    // Skipping mid voice-over: interrupt the DJ turn so the relay stops streaming
    // it (saves Gemini tokens). Its drained phase frames are dropped by the
    // Playhead fence once advance moves the pointer.
    if (s.phase === 'speaking') {
      refs.audioBusRef.current?.skipDj();
      refs.liveRef.current?.send({ type: 'skip_dj' });
    }

    postSessionEvent(s.sessionId, 'track_skipped', { track_id: s.trackId });
    refs.dispatchRef.current({ type: 'advance' });

    // The skipped-to track gets its own Cue — the DJ talks over its intro (segue),
    // since skipping bypasses the end-of-track break (CONTEXT: a Skip track Cues
    // its own DJ turn; amends ADR-0004). Kind omitted → the relay picks segue vs
    // outro by position. now_playing (from useTrackPlayback) mirrors the pointer.
    const nextIndex = s.currentTrackIndex + 1;
    refs.liveRef.current?.send({ type: 'cue_dj', track_index: nextIndex });
  }, [refs, releaseOpening]);

  const handleSkipDj = useCallback(() => {
    if (refs.stateRef.current.phase !== 'speaking') return;
    refs.audioBusRef.current?.skipDj();
    refs.liveRef.current?.send({ type: 'skip_dj' });
  }, [refs]);

  const handleTalkStart = useCallback(() => {
    const s = refs.stateRef.current;
    if (s.phase === 'idle' || s.phase === 'curating' || s.phase === 'paused' || s.isTalking) return;
    refs.audioBusRef.current?.setMusicVolume(0.15, 0.2);
    dispatch({ type: 'start_talk' });
  }, [refs, dispatch]);

  const handleTalkEnd = useCallback(() => {
    if (!refs.stateRef.current.isTalking) return;
    refs.audioBusRef.current?.setMusicVolume(1.0, 0.4);
    dispatch({ type: 'stop_talk' });
  }, [refs, dispatch]);

  const handleChangeHostMode = useCallback(
    (hostMode: HostMode) => {
      const s = refs.stateRef.current;
      if (!s.sessionId || s.hostMode === hostMode) return;
      refs.dispatchRef.current({ type: 'set_host_mode', hostMode });
      void postHostMode(s.sessionId, hostMode).then((ok) => {
        if (!ok) console.error('[host_mode] failed to update');
      });
    },
    [refs],
  );

  return {
    handleStart,
    handleTogglePause,
    handleSkipTrack,
    handleSkipDj,
    handleContinue,
    handleChangeHostMode,
    handleTalkStart,
    handleTalkEnd,
  };
}
