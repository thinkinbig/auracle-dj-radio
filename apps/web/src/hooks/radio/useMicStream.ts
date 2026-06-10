import { useEffect } from 'react';
import { startMicCapture, type MicCapture } from '../../lib/liveAudio';
import type { LiveRefs, StoreRefs } from './sessionRefs';

/**
 * Mic capture for the end-of-track talk window (ADR-0004). The stream is
 * acquired once per session (permission prompt), but PCM is only forwarded to
 * the Live socket while the listening window is open — mic is muted otherwise,
 * which boundary-gates the tools for free and avoids DJ-voice echo feedback.
 */
export function useMicStream(store: StoreRefs, live: LiveRefs, sessionId: string | null): void {
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let mic: MicCapture | null = null;
    startMicCapture((pcm) => {
      const s = store.stateRef.current;
      if (s.phase === 'listening' || s.isTalking) live.liveRef.current?.sendAudio(pcm);
    })
      .then((capture) => {
        if (cancelled) capture.stop();
        else mic = capture;
      })
      .catch((err) => console.error('[mic]', err));
    return () => {
      cancelled = true;
      mic?.stop();
    };
  }, [store, live, sessionId]);
}
