import { useCallback, useEffect, useRef } from 'react';
import type { Phase } from '@auracle/shared';
import { connectLiveSessionRtc } from '../lib/liveSessionRtc';
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
  isTalking: boolean;
  opening: Pick<OpeningGateControls, 'releaseOpening'>;
  setMicAnalyser: (analyser: AnalyserNode | null) => void;
}

/**
 * Open mic while music plays (hands-free talk via Gemini VAD) and during the
 * end-of-track listening window. Also keep it open while paused so the user can
 * resume hands-free ("play"/"continue") — pause stops the music but not the DJ's
 * ears. Mute it while the DJ speaks on speakers — an open mic would feed the
 * DJ's own voice back and self-interrupt; deliberate barge-in over the DJ stays
 * on hold-to-talk (isTalking).
 *
 * djSpeaking gates anti-echo independently of phase: while paused the phase
 * freezes (server_phase is dropped), so it can't carry the DJ's resume
 * acknowledgment — without this the mic would stay open through the DJ's own
 * voice. isTalking still wins so a deliberate barge-in over the DJ holds.
 */
function micShouldBeOpen(phase: UiPhase, isTalking: boolean, djSpeaking: boolean): boolean {
  if (isTalking) return true;
  if (djSpeaking) return false;
  return phase === 'playing' || phase === 'listening' || phase === 'paused';
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
  isTalking,
  opening,
  setMicAnalyser,
}: LiveConnectionInput): void {
  const { releaseOpening } = opening;
  // Whether a DJ turn is on the speakers right now, tracked from the turn
  // boundaries so the mic gate can mute even while paused (where `phase` freezes
  // and never reaches 'speaking').
  const djSpeakingRef = useRef(false);

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
      if (phase === 'dj_turn_end' && localIndex === 0) releaseOpening();
      if (phase === 'dj_turn_start' || phase === 'dj_turn_end') {
        djSpeakingRef.current = phase === 'dj_turn_start';
        // While paused the phase won't change, so the reactive gate effect won't
        // re-fire — apply the anti-echo mute here at the turn boundary instead.
        live.liveRef.current?.setMicEnabled(micShouldBeOpen(s.phase, s.isTalking, djSpeakingRef.current));
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
    // Fresh connection: no DJ turn is on the speakers yet. Reset so a turn cut
    // short by a prior disconnect can't leave the mic stuck muted.
    djSpeakingRef.current = false;

    void connectLiveSessionRtc(
      { proxyUrl, sessionId, token: token ?? undefined },
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
            const remainingIds = msg.remaining.map((t) => t.id);
            void prefetchTracks(remainingIds);
            store.dispatchRef.current({
              type: 'tracklist_updated',
              remaining: msg.remaining,
              sessionTitle: msg.session_title,
              sessionSubtitle: msg.session_subtitle,
              changedIds: msg.changed_ids,
              beforeRemainingIds: msg.before_remaining_ids,
            });
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
            }
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
        handle.setMicEnabled(micShouldBeOpen(s.phase, s.isTalking, djSpeakingRef.current));
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

  // Phase-gated mic mute (anti-echo) — the WebRTC port of the relay-era PCM gate.
  // DJ-turn boundaries apply the gate in onLivePhase (djSpeakingRef); this covers
  // phase/isTalking changes that happen between turns.
  useEffect(() => {
    live.liveRef.current?.setMicEnabled(micShouldBeOpen(phase, isTalking, djSpeakingRef.current));
  }, [live, phase, isTalking]);
}
