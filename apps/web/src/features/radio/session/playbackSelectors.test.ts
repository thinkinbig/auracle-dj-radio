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
    expect(statusLabel('speaking')).toEqual({ text: 'Speaking…', live: true });
  });

  it('groups technical phases into two app views', () => {
    expect(getAppView('idle')).toBe('mood_picking');
    expect(getAppView('curating')).toBe('mood_picking');
    expect(getAppView('opening')).toBe('playing');
    expect(getAppView('playing')).toBe('playing');
    expect(getAppView('speaking')).toBe('playing');
    expect(getAppView('listening')).toBe('playing');
    expect(getAppView('paused')).toBe('playing');
  });
});
