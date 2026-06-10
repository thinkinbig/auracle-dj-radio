import { useEffect } from 'react';
import { startMicCapture, type MicCapture } from '../../lib/liveAudio';
import type { LiveRefs, StoreRefs } from './sessionRefs';

/**
 * Mic capture for the end-of-track talk window (ADR-0004). The stream is
 * acquired once per session (permission prompt), but PCM is only forwarded to
 * the Live socket while the listening window is open — mic is muted otherwise,
 * which boundary-gates the tools for free and avoids DJ-voice echo feedback.
 *
 * Surfaces the mic's spectrum analyser via `onAnalyser` so the waveform can
 * switch to it while the listener holds the floor (null when the stream ends).
 */
export function useMicStream(
  store: StoreRefs,
  live: LiveRefs,
  sessionId: string | null,
  onAnalyser: (analyser: AnalyserNode | null) => void,
): void {
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let mic: MicCapture | null = null;
    startMicCapture((pcm) => {
      const s = store.stateRef.current;
      // Open mic while music plays (hands-free talk via Gemini VAD) and during the
      // end-of-track window. Stay muted while the DJ speaks — on speakers an open
      // mic would feed the DJ's own voice back and trigger a self-interrupt loop;
      // deliberate barge-in over the DJ stays on hold-to-talk (isTalking).
      if (s.phase === 'playing' || s.phase === 'listening' || s.isTalking) {
        live.liveRef.current?.sendAudio(pcm);
      }
    })
      .then((capture) => {
        if (cancelled) {
          capture.stop();
          return;
        }
        mic = capture;
        onAnalyser(capture.getAnalyser());
      })
      .catch((err) => console.error('[mic]', err));
    return () => {
      cancelled = true;
      mic?.stop();
      onAnalyser(null);
    };
  }, [store, live, sessionId, onAnalyser]);
}
