import { useCallback } from 'react';
import type { Dispatch } from 'react';
import type { HostMode } from '@auracle/shared';
import { createAudioBus } from '../../lib/liveAudio';
import { createSession, postHostMode, postSessionEvent } from '../../lib/sessionApi';
import { prefetchTracks } from '../../lib/trackCatalog';
import type { PlaybackAction } from '../../lib/playbackReducer';
import type { OpeningGateControls } from './useOpeningGate';
import type { SessionRefs } from './sessionRefs';

export interface RadioHandlers {
  handleStart: () => Promise<void>;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleSkipDj: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
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

  const handleStart = useCallback(async () => {
    const audio = refs.audioRef.current ?? (refs.audioRef.current = new Audio());
    if (!refs.audioBusRef.current) {
      const bus = createAudioBus();
      bus.attachMusicElement(audio);
      refs.audioBusRef.current = bus;
      setAnalyser(bus.getAnalyser());
    }
    await refs.audioBusRef.current.resume();
    dispatch({ type: 'begin' });
    const session = await createSession();
    void prefetchTracks(session.tracklist.map((t) => t.id));
    dispatch({ type: 'start', session });
  }, [refs, dispatch, setAnalyser]);

  const handleTogglePause = useCallback(() => {
    dispatch({ type: 'toggle_pause' });
  }, [dispatch]);

  const handleSkipTrack = useCallback(() => {
    const s = refs.stateRef.current;
    if (!s.sessionId || s.phase === 'idle' || s.phase === 'curating') return;
    if (s.remainingTrackIds.length === 0) return;

    refs.skipGuardRef.current = true;
    refs.audioRef.current?.pause();
    if (s.currentTrackIndex === 0) releaseOpening();

    postSessionEvent(s.sessionId, 'track_skipped', { track_id: s.trackId });
    refs.dispatchRef.current({ type: 'advance' });
  }, [refs, releaseOpening]);

  const handleSkipDj = useCallback(() => {
    if (refs.stateRef.current.phase !== 'speaking') return;
    refs.audioBusRef.current?.skipDj();
    refs.liveRef.current?.send({ type: 'skip_dj' });
  }, [refs]);

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
    handleChangeHostMode,
  };
}
