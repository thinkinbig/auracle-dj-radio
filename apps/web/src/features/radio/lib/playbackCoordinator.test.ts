import { describe, expect, it } from 'vitest';
import { isOpeningBlocked, musicVolume, shouldPlayMusic, MUSIC_VOLUME } from './playbackCoordinator';

describe('playbackCoordinator', () => {
  it('blocks music on opening track until released', () => {
    const input = { phase: 'opening' as const, currentTrackIndex: 0, openingReleased: false };
    expect(isOpeningBlocked(input)).toBe(true);
    expect(musicVolume(input)).toBe(MUSIC_VOLUME.silent);
    expect(shouldPlayMusic(input)).toBe(false);
  });

  it('does not auto-play during opening even if the release state is briefly stale', () => {
    const input = { phase: 'opening' as const, currentTrackIndex: 0, openingReleased: true };
    expect(musicVolume(input)).toBe(MUSIC_VOLUME.full);
    expect(shouldPlayMusic(input)).toBe(false);
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

  it('cuts music to silent while the listener holds the floor, over the duck', () => {
    const input = { phase: 'playing' as const, currentTrackIndex: 1, openingReleased: true, isTalking: true };
    expect(musicVolume(input)).toBe(MUSIC_VOLUME.silent);
    // The element keeps playing (gain 0) so it resumes instantly on release.
    expect(shouldPlayMusic(input)).toBe(true);
  });
});
