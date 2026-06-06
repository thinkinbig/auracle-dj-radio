import type { PlaybackState, UiPhase } from '../types';

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

export function statusLabel(phase: UiPhase): { text: string; live: boolean } {
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
      return { text: 'Tap to start', live: false };
  }
}
