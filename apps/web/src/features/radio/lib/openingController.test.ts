import { describe, expect, it, vi } from 'vitest';
import { createOpeningController } from './openingController';

describe('createOpeningController', () => {
  it('calls onRelease once when release is invoked', () => {
    vi.useFakeTimers();
    const onRelease = vi.fn();
    const ctrl = createOpeningController(onRelease);
    ctrl.armForTrack(0);
    ctrl.release();
    expect(onRelease).toHaveBeenCalledTimes(1);
    ctrl.release();
    expect(onRelease).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('falls back via timeout', () => {
    vi.useFakeTimers();
    const onRelease = vi.fn();
    const ctrl = createOpeningController(onRelease);
    ctrl.armForTrack(0);
    vi.advanceTimersByTime(20_000);
    expect(onRelease).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
