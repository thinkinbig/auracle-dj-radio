import { useCallback, useEffect, useRef, useState } from 'react';
import { createOpeningController, type OpeningController } from '../../lib/openingController';
import { MUSIC_VOLUME } from '../../lib/playbackCoordinator';
import type { AudioRefs, StoreRefs } from './sessionRefs';

export interface OpeningGateControls {
  openingReleased: boolean;
  releaseOpening: () => void;
  armForTrack: (trackIndex: number) => void;
}

export function useOpeningGate(store: StoreRefs, audio: AudioRefs): OpeningGateControls {
  const [openingReleased, setOpeningReleased] = useState(true);
  // Owned here: the opening controller (gate + fallback timer) lives and dies with this hook.
  const openingRef = useRef<OpeningController | null>(null);

  const notifyOpeningReleased = useCallback(() => {
    setOpeningReleased(true);
    const bus = audio.audioBusRef.current;
    const s = store.stateRef.current;
    if (bus && s.currentTrackIndex === 0) bus.setMusicVolume(MUSIC_VOLUME.full, 0);
    const el = audio.audioRef.current;
    if (el && s.phase !== 'paused' && s.phase !== 'idle' && s.phase !== 'curating') {
      void el.play().catch(() => {});
    }
  }, [store, audio]);

  useEffect(() => {
    openingRef.current = createOpeningController(notifyOpeningReleased);
    return () => openingRef.current?.dispose();
  }, [notifyOpeningReleased]);

  const releaseOpening = useCallback(() => {
    openingRef.current?.release();
  }, []);

  const armForTrack = useCallback((trackIndex: number) => {
    if (trackIndex === 0) setOpeningReleased(false);
    else setOpeningReleased(true);
    openingRef.current?.armForTrack(trackIndex);
  }, []);

  return { openingReleased, releaseOpening, armForTrack };
}
