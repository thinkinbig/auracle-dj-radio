import { describe, expect, it } from 'vitest';
import { micShouldBeOpen, shouldReleaseOpeningForPhase } from './useLiveConnection';

describe('live connection phase helpers', () => {
  it('keeps the mic transport open during live phases so backend VAD can detect barge-in', () => {
    expect(micShouldBeOpen('opening')).toBe(true);
    expect(micShouldBeOpen('speaking')).toBe(true);
    expect(micShouldBeOpen('playing')).toBe(true);
    expect(micShouldBeOpen('listening')).toBe(true);
    expect(micShouldBeOpen('paused')).toBe(true);
    expect(micShouldBeOpen('idle')).toBe(false);
    expect(micShouldBeOpen('curating')).toBe(false);
    expect(micShouldBeOpen('complete')).toBe(false);
  });

  it('releases the opening gate when the first DJ turn ends or is interrupted', () => {
    expect(shouldReleaseOpeningForPhase('dj_turn_end', 0)).toBe(true);
    expect(shouldReleaseOpeningForPhase('user_barge_in', 0)).toBe(true);
    expect(shouldReleaseOpeningForPhase('user_barge_in', 1)).toBe(false);
    expect(shouldReleaseOpeningForPhase('dj_turn_start', 0)).toBe(false);
  });
});
