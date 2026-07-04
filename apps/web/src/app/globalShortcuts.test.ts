import { describe, expect, it, vi } from 'vitest';
import type { UiPhase } from '@/features/radio/session/types';
import { handleGlobalRadioShortcut, shouldIgnoreGlobalShortcutTarget } from './globalShortcuts';

function target(tagName: string, isContentEditable = false): EventTarget {
  return { tagName, isContentEditable } as unknown as EventTarget;
}

const playing: UiPhase = 'playing';

describe('shouldIgnoreGlobalShortcutTarget', () => {
  it('ignores text entry surfaces', () => {
    expect(shouldIgnoreGlobalShortcutTarget(target('input'))).toBe(true);
    expect(shouldIgnoreGlobalShortcutTarget(target('textarea'))).toBe(true);
    expect(shouldIgnoreGlobalShortcutTarget(target('select'))).toBe(true);
    expect(shouldIgnoreGlobalShortcutTarget(target('div', true))).toBe(true);
  });

  it('allows shortcuts on non-editable elements', () => {
    expect(shouldIgnoreGlobalShortcutTarget(target('button'))).toBe(false);
    expect(shouldIgnoreGlobalShortcutTarget(null)).toBe(false);
  });
});

describe('handleGlobalRadioShortcut', () => {
  it('ignores shortcuts while typing in a textarea', () => {
    const preventDefault = vi.fn();
    const handleTogglePause = vi.fn();
    const handleSkipTrack = vi.fn();

    const handled = handleGlobalRadioShortcut(
      { code: 'Space', target: target('textarea'), preventDefault },
      playing,
      handleTogglePause,
      handleSkipTrack,
    );

    expect(handled).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(handleTogglePause).not.toHaveBeenCalled();
    expect(handleSkipTrack).not.toHaveBeenCalled();
  });

  it('handles space and n on non-editable surfaces', () => {
    const preventDefault = vi.fn();
    const handleTogglePause = vi.fn();
    const handleSkipTrack = vi.fn();

    expect(
      handleGlobalRadioShortcut(
        { code: 'Space', target: target('main'), preventDefault },
        playing,
        handleTogglePause,
        handleSkipTrack,
      ),
    ).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(handleTogglePause).toHaveBeenCalledTimes(1);

    expect(
      handleGlobalRadioShortcut(
        { code: 'KeyN', target: target('main'), preventDefault },
        playing,
        handleTogglePause,
        handleSkipTrack,
      ),
    ).toBe(true);
    expect(handleSkipTrack).toHaveBeenCalledTimes(1);
  });
});
