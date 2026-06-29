import { describe, expect, it } from 'vitest';
import { createInitialPlaybackState } from './playbackReducer';
import {
  canSkipTrack,
  getAppView,
  hasNextTrack,
  hostModeDisabled,
  isCurating,
  isIdle,
  isOnAir,
  isPaused,
  playbackProgressPct,
  selectQueueRefresh,
  statusLabel,
} from './playbackSelectors';

describe('playbackSelectors', () => {
  const idle = createInitialPlaybackState();

  it('derives skip eligibility from phase and queue', () => {
    expect(canSkipTrack(idle)).toBe(false);
    const playing = { ...idle, phase: 'playing' as const };
    expect(canSkipTrack(playing)).toBe(true);
    const lastTrack = { ...playing, remainingTrackIds: [] };
    expect(canSkipTrack(lastTrack)).toBe(false);
  });

  it('reports on-air and host mode availability', () => {
    expect(isOnAir(idle)).toBe(false);
    expect(hostModeDisabled(idle)).toBe(true);
    const playing = { ...idle, phase: 'playing' as const };
    expect(isOnAir(playing)).toBe(true);
    expect(hostModeDisabled(playing)).toBe(false);
  });

  it('computes playback progress', () => {
    const state = { ...idle, progressSec: 30, durationSec: 120 };
    expect(playbackProgressPct(state)).toBe(25);
  });

  it('exposes phase helpers and status copy', () => {
    expect(isIdle('idle')).toBe(true);
    expect(isPaused('paused')).toBe(true);
    expect(isCurating('curating')).toBe(true);
    expect(hasNextTrack(idle)).toBe(true);
    expect(statusLabel('speaking', 'idle')).toEqual({ text: 'Speaking…', live: true });
    expect(statusLabel('complete', 'pending')).toEqual({ text: 'Finding more music…', live: true });
    expect(statusLabel('complete', 'error')).toEqual({ text: 'Session complete', live: false });
  });

  it('reads queue refresh intent and retryability from one source', () => {
    expect(selectQueueRefresh(idle)).toMatchObject({ status: 'idle', intent: 'extend', pending: false, retryable: false });

    const extending = { ...idle, queueRefreshStatus: 'pending' as const };
    expect(selectQueueRefresh(extending)).toMatchObject({ intent: 'extend', pending: true });

    const rebuilding = { ...idle, queueRefreshStatus: 'pending' as const, playlistFeedback: 'regenerate' as const };
    expect(selectQueueRefresh(rebuilding)).toMatchObject({ intent: 'regenerate', pending: true });

    const extendFailed = { ...idle, queueRefreshStatus: 'error' as const };
    expect(selectQueueRefresh(extendFailed)).toMatchObject({ failed: true, retryable: true });

    const regenerateFailed = { ...idle, queueRefreshStatus: 'error' as const, playlistFeedback: 'regenerate' as const };
    expect(selectQueueRefresh(regenerateFailed)).toMatchObject({ failed: true, retryable: false });
  });

  it('groups technical phases into two app views', () => {
    expect(getAppView('idle')).toBe('mood_picking');
    expect(getAppView('curating')).toBe('mood_picking');
    expect(getAppView('opening')).toBe('playing');
    expect(getAppView('playing')).toBe('playing');
    expect(getAppView('speaking')).toBe('playing');
    expect(getAppView('listening')).toBe('playing');
    expect(getAppView('paused')).toBe('playing');
    expect(getAppView('complete')).toBe('playing');
  });
});
