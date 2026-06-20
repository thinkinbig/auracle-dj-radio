import { useEffect } from 'react';
import type { Dispatch } from 'react';
import { isSessionClockRunning } from '../lib/playbackCoordinator';
import type { PlaybackAction } from '../session/playbackReducer';
import type { UiPhase } from '@/features/radio/session/types';

/** Session elapsed timer; ticks once per second while playback is active. */
export function useSessionClock(phase: UiPhase, dispatch: Dispatch<PlaybackAction>): void {
  useEffect(() => {
    if (!isSessionClockRunning(phase)) return;
    const id = setInterval(() => dispatch({ type: 'tick' } satisfies PlaybackAction), 1000);
    return () => clearInterval(id);
  }, [phase, dispatch]);
}
