import { describe, expect, it } from 'vitest';
import { isOpeningBlocked, musicVolume, shouldPlayMusic, MUSIC_VOLUME } from './playbackCoordinator';

describe('playbackCoordinator', () => {
  it('blocks music on opening track until released', () => {
    const input = { phase: 'opening' as const, currentTrackIndex: 0, openingReleased: false };
    expect(isOpeningBlocked(input)).toBe(true);
    expect(musicVolume(input)).toBe(MUSIC_VOLUME.silent);
    expect(shouldPlayMusic(input)).toBe(false);
  });

  it('plays during opening once the gate is released', () => {
    const input = { phase: 'opening' as const, currentTrackIndex: 0, openingReleased: true };
    expect(musicVolume(input)).toBe(MUSIC_VOLUME.full);
    expect(shouldPlayMusic(input)).toBe(true);
  });

  it('ducks during DJ turn after opening', () => {
    const input = { phase: 'speaking' as const, currentTrackIndex: 1, openingReleased: true };
    expect(musicVolume(input)).toBe(MUSIC_VOLUME.duck);
    expect(shouldPlayMusic(input)).toBe(true);
  });

  it('full volume when playing after opening', () => {
    const input = { phase: 'playing' as const, currentTrackIndex: 0, openingReleased: true };
    expect(musicVolume(input)).toBe(MUSIC_VOLUME.full);
    expect(shouldPlayMusic(input)).toBe(true);
  });
});
