import { useCallback, useEffect } from 'react';
import type { Phase } from '@auracle/shared';
import { connectLiveSessionRtc } from '../lib/liveSessionRtc';
import { getStoredToken } from '@/features/marketing/authApi';
import { createMicAnalyser, type MicAnalyser } from '../lib/liveAudio';
import { prefetchTracks } from '@/data/trackCatalog';
import type { RadioCommands } from '../lib/radioCommands';
import type { UiPhase } from '@/features/radio/session/types';
import type { OpeningGateControls } from './useOpeningGate';
import type { AudioRefs, LiveRefs, StoreRefs } from './sessionRefs';

interface LiveConnectionInput {
  store: StoreRefs;
  audio: AudioRefs;
  live: LiveRefs;
  commands: RadioCommands;
  proxyUrl: string | null;
  sessionId: string | null;
  token: string | null;
  phase: UiPhase;
  opening: Pick<OpeningGateControls, 'releaseOpening'>;
  setMicAnalyser: (analyser: AnalyserNode | null) => void;
}

/**
 * Frontend mic policy is transport gating, not VAD. Keep the track enabled for
 * every live session phase where the backend/provider VAD should be able to hear
 * the listener, including opening and DJ speech. Browser AEC is requested in
 * getUserMedia; if speaker bleed causes false barge-ins, fix echo handling there
 * or in the proxy, not by muting the uplink.
 */
export function micShouldBeOpen(phase: UiPhase): boolean {
  return (
    phase === 'opening' ||
    phase === 'playing' ||
    phase === 'speaking' ||
    phase === 'listening' ||
    phase === 'paused'
  );
}

export function shouldReleaseOpeningForPhase(phase: Phase, trackIndex: number): boolean {
  return trackIndex === 0 && (phase === 'dj_turn_end' || phase === 'user_barge_in');
}

/** WebRTC live session to the proxy: DJ stream, transcripts, phase sync, intents, mic. */
export function useLiveConnection({
  store,
  audio,
  live,
  commands,
  proxyUrl,
  sessionId,
  token,
  phase,
  opening,
  setMicAnalyser,
}: LiveConnectionInput): void {
  const { releaseOpening } = opening;

  // The single inbound-phase reaction site: data-plane side effects only. What a
  // phase MEANS for UI state (mapServerPhase, break → listening, Playhead fence)
  // lives in the reducer's `server_phase` case. The proxy stamps a placeholder
  // track_index, so we use the LOCAL playhead for both the fence and the gate.
  const onLivePhase = useCallback(
    (phase: Phase) => {
      const bus = audio.audioBusRef.current;
      const s = store.stateRef.current;
      const localIndex = s.currentTrackIndex;
      if (phase === 'dj_turn_start' && bus) bus.resumeDj();
      if (shouldReleaseOpeningForPhase(phase, localIndex)) releaseOpening();
      if (phase === 'dj_turn_start' || phase === 'dj_turn_end' || phase === 'user_barge_in') {
        live.liveRef.current?.setMicEnabled(micShouldBeOpen(s.phase));
      }
      store.dispatchRef.current({ type: 'server_phase', phase, trackIndex: localIndex });
    },
    [store, audio, live, releaseOpening],
  );

  useEffect(() => {
    if (!proxyUrl || !sessionId) return;
    const bus = audio.audioBusRef.current;
    if (!bus) return;

    let cancelled = false;
    let mic: MicAnalyser | null = null;
    void connectLiveSessionRtc(
      { proxyUrl, sessionId, token: token ?? undefined, authToken: getStoredToken() ?? undefined },
      {
        onRemoteStream: (stream) => bus.attachDjStream(stream),
        onLocalStream: (stream) => {
          if (cancelled) return;
          mic = createMicAnalyser(stream);
          setMicAnalyser(mic.getAnalyser());
        },
        onClose: () => {
          if (store.stateRef.current.currentTrackIndex === 0) releaseOpening();
        },
        onMessage: (msg) => {
          if (msg.type === 'transcript') {
            store.dispatchRef.current({ type: 'transcript', role: msg.role, text: msg.text });
          } else if (msg.type === 'phase') {
            onLivePhase(msg.phase);
          } else if (msg.type === 'tracklist_updated') {
            void prefetchTracks(msg.remaining);
            store.dispatchRef.current({
              type: 'tracklist_updated',
              remaining: msg.remaining,
              sessionTitle: msg.session_title,
              sessionSubtitle: msg.session_subtitle,
              changedIds: msg.changed_ids,
              beforeRemainingIds: msg.before_remaining_ids,
            });
          } else if (msg.type === 'queue_refresh') {
            store.dispatchRef.current({ type: 'queue_refresh', status: msg.status });
            if (msg.status === 'error' && store.stateRef.current.playlistFeedback === 'regenerate') {
              store.dispatchRef.current({ type: 'playlist_feedback_failed', feedback: 'regenerate' });
            }
          } else if (msg.type === 'intent') {
            if (msg.intent.type === 'skip_track') {
              // Same Skip track command as the Next button (ADR-0004 amendment).
              commands.skipTrack();
            } else if (msg.intent.type === 'pause_playback') {
              store.dispatchRef.current({
                type: 'set_playback',
                paused: msg.intent.action === 'pause',
              });
            } else if (msg.intent.type === 'host_mode_changed') {
              store.dispatchRef.current({
                type: 'set_host_mode',
                hostMode: msg.intent.host_mode,
              });
            } else if (msg.intent.type === 'playlist_feedback') {
              // DJ tool path: server already recorded the analytics event.
              store.dispatchRef.current({
                type: 'playlist_feedback',
                feedback: msg.intent.feedback,
              });
            }
          } else if (msg.type === 'session_superseded') {
            // The user started a set on another device (issue #55): stop playback,
            // surface the "playing elsewhere" UX, and drop this WebRTC connection
            // so the proxy tears down the old hub entry.
            store.dispatchRef.current({ type: 'session_superseded' });
            if (store.stateRef.current.currentTrackIndex === 0) releaseOpening();
            live.liveRef.current?.close();
            live.liveRef.current = null;
          } else if (msg.type === 'error') {
            console.error('[live]', msg.message);
            if (store.stateRef.current.currentTrackIndex === 0) releaseOpening();
          }
        },
      },
    )
      .then((handle) => {
        if (cancelled) {
          handle.close();
          return;
        }
        live.liveRef.current = handle;
        // Apply the current phase's mic gate now — the gating effect below ran
        // before the handle existed (async connect) and won't re-fire on its own.
        const s = store.stateRef.current;
        handle.setMicEnabled(micShouldBeOpen(s.phase));
      })
      .catch((err) => {
        console.error('[live] connect failed', err);
        if (store.stateRef.current.currentTrackIndex === 0) releaseOpening();
      });

    return () => {
      cancelled = true;
      live.liveRef.current?.close();
      live.liveRef.current = null;
      mic?.stop();
      setMicAnalyser(null);
    };
  }, [store, audio, live, commands, proxyUrl, sessionId, token, onLivePhase, releaseOpening, setMicAnalyser]);

  // Phase-gated transport mute. Speech detection itself lives in the proxy/provider.
  useEffect(() => {
    live.liveRef.current?.setMicEnabled(micShouldBeOpen(phase));
  }, [live, phase]);
}
