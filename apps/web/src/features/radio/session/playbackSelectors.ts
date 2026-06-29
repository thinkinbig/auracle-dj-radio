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

/** Which flow is refreshing the queue: an automatic rolling extend or a user-driven regenerate. */
export type QueueRefreshIntent = 'extend' | 'regenerate';

export interface QueueRefreshView {
  status: PlaybackState['queueRefreshStatus'];
  intent: QueueRefreshIntent;
  pending: boolean;
  failed: boolean;
  /** A failed refresh the user can retry via the extend endpoint (regenerate has no retry wired). */
  retryable: boolean;
}

/**
 * Single source of truth for "what is the queue refresh doing right now". Collapses the
 * scattered `queueRefreshStatus` + `playlistFeedback === 'regenerate'` reads that the queue
 * sidebar and end-of-session surfaces each re-derived on their own.
 */
export function selectQueueRefresh(state: PlaybackState): QueueRefreshView {
  const status = state.queueRefreshStatus;
  const intent: QueueRefreshIntent = state.playlistFeedback === 'regenerate' ? 'regenerate' : 'extend';
  return {
    status,
    intent,
    pending: status === 'pending',
    failed: status === 'error',
    retryable: status === 'error' && intent === 'extend',
  };
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
