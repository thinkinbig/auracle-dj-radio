import type { UiPhase } from '@/features/radio/session/types';

type ShortcutTarget = EventTarget | null;

interface KeyboardLikeEvent {
  code: string;
  target: ShortcutTarget;
  preventDefault(): void;
}

export function shouldIgnoreGlobalShortcutTarget(target: ShortcutTarget): boolean {
  if (!target || typeof target !== 'object') return false;

  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
  };
  const tagName = element.tagName?.toUpperCase();

  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable === true;
}

export function handleGlobalRadioShortcut(
  event: KeyboardLikeEvent,
  phase: UiPhase,
  handleTogglePause: () => void,
  handleSkipTrack: () => void,
): boolean {
  if (shouldIgnoreGlobalShortcutTarget(event.target)) return false;

  if (event.code === 'Space') {
    event.preventDefault();
    if (phase === 'idle') return true;
    handleTogglePause();
    return true;
  }

  if (event.code === 'ArrowRight' || event.code === 'KeyN') {
    event.preventDefault();
    handleSkipTrack();
    return true;
  }

  return false;
}
