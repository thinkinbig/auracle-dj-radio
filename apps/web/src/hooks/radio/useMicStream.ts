import { useEffect } from 'react';
import { startMicCapture, type MicCapture } from '../../lib/liveAudio';
import type { SessionRefs } from './sessionRefs';

/** Mic capture for barge-in; streams PCM to the Live socket while a session is active. */
export function useMicStream(refs: SessionRefs, sessionId: string | null): void {
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let mic: MicCapture | null = null;
    startMicCapture((pcm) => refs.liveRef.current?.sendAudio(pcm))
      .then((capture) => {
        if (cancelled) capture.stop();
        else mic = capture;
      })
      .catch((err) => console.error('[mic]', err));
    return () => {
      cancelled = true;
      mic?.stop();
    };
  }, [refs, sessionId]);
}
