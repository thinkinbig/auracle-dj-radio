import { useCallback, useEffect, useState } from 'react';
import { createOpeningController } from '../../lib/openingController';
import { MUSIC_VOLUME } from '../../lib/playbackCoordinator';
import type { SessionRefs } from './sessionRefs';

export interface OpeningGateControls {
  openingReleased: boolean;
  releaseOpening: () => void;
  armForTrack: (trackIndex: number) => void;
}

export function useOpeningGate(refs: SessionRefs): OpeningGateControls {
  const [openingReleased, setOpeningReleased] = useState(true);

  const notifyOpeningReleased = useCallback(() => {
    setOpeningReleased(true);
    const bus = refs.audioBusRef.current;
    const s = refs.stateRef.current;
    if (bus && s.currentTrackIndex === 0) bus.setMusicVolume(MUSIC_VOLUME.full, 0);
    const audio = refs.audioRef.current;
    if (audio && s.phase !== 'paused' && s.phase !== 'idle' && s.phase !== 'curating') {
      void audio.play().catch(() => {});
    }
  }, [refs]);

  useEffect(() => {
    refs.openingRef.current = createOpeningController(notifyOpeningReleased);
    return () => refs.openingRef.current?.dispose();
  }, [refs, notifyOpeningReleased]);

  const releaseOpening = useCallback(() => {
    refs.openingRef.current?.release();
  }, [refs]);

  const armForTrack = useCallback(
    (trackIndex: number) => {
      if (trackIndex === 0) setOpeningReleased(false);
      else setOpeningReleased(true);
      refs.openingRef.current?.armForTrack(trackIndex);
    },
    [refs],
  );

  return { openingReleased, releaseOpening, armForTrack };
}
