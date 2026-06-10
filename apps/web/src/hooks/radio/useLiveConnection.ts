import { useCallback, useEffect } from 'react';
import type { Phase } from '@auracle/shared';
import { connectLiveSession } from '../../lib/liveSession';
import { prefetchTracks } from '../../lib/trackCatalog';
import type { RadioCommands } from '../../lib/radioCommands';
import type { OpeningGateControls } from './useOpeningGate';
import type { AudioRefs, LiveRefs, StoreRefs } from './sessionRefs';

interface LiveConnectionInput {
  store: StoreRefs;
  audio: AudioRefs;
  live: LiveRefs;
  commands: RadioCommands;
  liveWsUrl: string | null;
  opening: Pick<OpeningGateControls, 'releaseOpening'>;
}

/** Live WebSocket: DJ PCM, transcripts, phase sync, and remote intents. */
export function useLiveConnection({ store, audio, live, commands, liveWsUrl, opening }: LiveConnectionInput): void {
  const { releaseOpening } = opening;

  // The single inbound-phase reaction site: data-plane side effects only. What a
  // phase MEANS for UI state (mapServerPhase, break → listening, Playhead fence)
  // lives in the reducer's `server_phase` case.
  const onLivePhase = useCallback(
    (phase: Phase, trackIndex: number) => {
      const bus = audio.audioBusRef.current;
      if (phase === 'dj_turn_start' && bus) bus.resumeDj();
      if (phase === 'dj_turn_end' && trackIndex === 0) releaseOpening();
      store.dispatchRef.current({ type: 'server_phase', phase, trackIndex });
    },
    [store, audio, releaseOpening],
  );

  useEffect(() => {
    if (!liveWsUrl) return;
    const bus = audio.audioBusRef.current;
    if (!bus) return;

    const handle = connectLiveSession(liveWsUrl, {
      onClose: () => {
        if (store.stateRef.current.currentTrackIndex === 0) releaseOpening();
      },
      onAudio: (pcm) => bus.playDj(pcm),
      onMessage: (msg) => {
        if (msg.type === 'transcript') {
          store.dispatchRef.current({ type: 'transcript', role: msg.role, text: msg.text });
        } else if (msg.type === 'phase') {
          onLivePhase(msg.phase, msg.track_index);
        } else if (msg.type === 'tracklist_updated') {
          const remainingIds = msg.remaining.map((t) => t.id);
          void prefetchTracks(remainingIds);
          store.dispatchRef.current({
            type: 'tracklist_updated',
            remainingIds,
            sessionTitle: msg.session_title,
            sessionSubtitle: msg.session_subtitle,
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
    });
    live.liveRef.current = handle;
    return () => {
      handle.close();
      live.liveRef.current = null;
    };
  }, [store, audio, live, commands, liveWsUrl, onLivePhase, releaseOpening]);
}
