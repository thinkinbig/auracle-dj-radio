import { useCallback, useEffect, useRef } from 'react';
import { TALK_WINDOW } from '../../lib/playbackCoordinator';
import type { UiPhase } from '../../types';
import type { StoreRefs } from './sessionRefs';

/**
 * Owns the end-of-track listening window (ADR-0004). While `inBreak`:
 * - each time the DJ stops and the window opens (`phase === 'listening'`) a
 *   silence timer runs (`openMs` first, then `followMs`); it advances on timeout.
 * - a fresh user utterance cancels the silence timer (the DJ will reply, which
 *   reopens the window — "loop until silence").
 * - a hard cap (`hardCapMs` or `maxUserTurns`) force-advances so a noisy room or
 *   an over-talking DJ can never stall the radio.
 */
export function useTalkWindow(
  store: StoreRefs,
  phase: UiPhase,
  inBreak: boolean,
  userUtteranceCount: number,
): void {
  const silenceTimer = useRef<number | null>(null);
  const capTimer = useRef<number | null>(null);
  const opensInBreak = useRef(0); // listening windows opened in the current break
  const turnBaseline = useRef(0); // userUtteranceCount when the break began

  const clearSilence = useCallback(() => {
    if (silenceTimer.current !== null) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    clearSilence();
    store.dispatchRef.current({ type: 'advance' });
  }, [store, clearSilence]);

  // Break lifecycle: reset counters and arm the hard cap.
  useEffect(() => {
    if (!inBreak) return;
    opensInBreak.current = 0;
    turnBaseline.current = store.stateRef.current.userUtteranceCount;
    capTimer.current = window.setTimeout(advance, TALK_WINDOW.hardCapMs);
    return () => {
      if (capTimer.current !== null) {
        clearTimeout(capTimer.current);
        capTimer.current = null;
      }
    };
  }, [inBreak, advance, store]);

  // Window lifecycle: a silence timer runs only while the listening window is open.
  useEffect(() => {
    if (!inBreak || phase !== 'listening') return;
    opensInBreak.current += 1;
    const ms = opensInBreak.current <= 1 ? TALK_WINDOW.openMs : TALK_WINDOW.followMs;
    silenceTimer.current = window.setTimeout(advance, ms);
    return clearSilence;
  }, [phase, inBreak, advance, clearSilence]);

  // User spoke during the window: cancel the countdown (wait for the DJ's reply),
  // and force-advance once they've used up their turns this break.
  useEffect(() => {
    if (!inBreak || phase !== 'listening') return;
    if (userUtteranceCount > turnBaseline.current) clearSilence();
    if (userUtteranceCount - turnBaseline.current >= TALK_WINDOW.maxUserTurns) advance();
  }, [userUtteranceCount, inBreak, phase, advance, clearSilence]);
}
