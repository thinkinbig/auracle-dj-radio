import type { PlaybackState, UiPhase } from '@/features/radio/session/types';

export type AppView = 'mood_picking' | 'playing';

export function getAppView(phase: UiPhase): AppView {
  return phase === 'idle' || phase === 'curating' ? 'mood_picking' : 'playing';
}

export function isIdle(phase: UiPhase): boolean {
  return phase === 'idle';
}

export function isPaused(phase: UiPhase): boolean {
  return phase === 'paused';
}

export function isCurating(phase: UiPhase): boolean {
  return phase === 'curating';
}

export function hasNextTrack(state: PlaybackState): boolean {
  return state.remainingTrackIds.length > 0;
}

export function canSkipTrack(state: PlaybackState): boolean {
  return !isIdle(state.phase) && !isCurating(state.phase) && hasNextTrack(state);
}

export function isOnAir(state: PlaybackState): boolean {
  return !isIdle(state.phase);
}

export function hostModeDisabled(state: PlaybackState): boolean {
  return isIdle(state.phase) || isCurating(state.phase);
}

export function playbackProgressPct(state: PlaybackState): number {
  return state.durationSec > 0
    ? Math.min(100, (state.progressSec / state.durationSec) * 100)
    : 0;
}

export function isSessionComplete(phase: UiPhase): boolean {
  return phase === 'complete';
}

export function statusLabel(phase: UiPhase, queueRefreshStatus: PlaybackState['queueRefreshStatus']): { text: string; live: boolean } {
  if (phase === 'complete') {
    if (queueRefreshStatus === 'pending') return { text: 'Finding more music…', live: true };
    return { text: 'Session complete', live: false };
  }
  switch (phase) {
    case 'curating':
      return { text: 'Tuning in…', live: true };
    case 'opening':
    case 'speaking':
      return { text: 'Speaking…', live: true };
    case 'listening':
      return { text: 'Listening…', live: true };
    case 'playing':
      return { text: 'Playing…', live: false };
    case 'paused':
      return { text: 'Paused', live: false };
    default:
      return { text: 'Set your vibe', live: false };
  }
}
