import { useCallback, useEffect } from 'react';
import type { Phase } from '@auracle/shared';
import { connectLiveSession } from '../../lib/liveSession';
import { prefetchTracks } from '../../lib/trackCatalog';
import type { OpeningGateControls } from './useOpeningGate';
import type { SessionRefs } from './sessionRefs';

interface LiveConnectionInput {
  refs: SessionRefs;
  liveWsUrl: string | null;
  opening: Pick<OpeningGateControls, 'releaseOpening'>;
}

/** Live WebSocket: DJ PCM, transcripts, phase sync, and remote intents. */
export function useLiveConnection({ refs, liveWsUrl, opening }: LiveConnectionInput): void {
  const { releaseOpening } = opening;

  const onLivePhase = useCallback(
    (phase: Phase, trackIndex: number) => {
      const bus = refs.audioBusRef.current;
      if (phase === 'dj_turn_start' && bus) bus.resumeDj();
      if (phase === 'dj_turn_end' && trackIndex === 0) releaseOpening();
      refs.dispatchRef.current({ type: 'server_phase', phase, trackIndex });
    },
    [refs, releaseOpening],
  );

  useEffect(() => {
    if (!liveWsUrl) return;
    const bus = refs.audioBusRef.current;
    if (!bus) return;

    const handle = connectLiveSession(liveWsUrl, {
      onClose: () => {
        if (refs.stateRef.current.currentTrackIndex === 0) releaseOpening();
      },
      onAudio: (pcm) => bus.playDj(pcm),
      onMessage: (msg) => {
        if (msg.type === 'transcript') {
          refs.dispatchRef.current({ type: 'transcript', role: msg.role, text: msg.text });
        } else if (msg.type === 'phase') {
          onLivePhase(msg.phase, msg.track_index);
        } else if (msg.type === 'tracklist_updated') {
          const remainingIds = msg.remaining.map((t) => t.id);
          void prefetchTracks(remainingIds);
          refs.dispatchRef.current({
            type: 'tracklist_updated',
            remainingIds,
            sessionTitle: msg.session_title,
            sessionSubtitle: msg.session_subtitle,
          });
        } else if (msg.type === 'intent') {
          if (msg.intent.type === 'skip_track') {
            const cur = refs.stateRef.current;
            refs.skipGuardRef.current = true;
            refs.audioRef.current?.pause();
            // Skipping mid voice-over: interrupt the DJ turn (saves tokens; its
            // drained frames are dropped by the Playhead fence once we advance).
            if (cur.phase === 'speaking') {
              refs.audioBusRef.current?.skipDj();
              refs.liveRef.current?.send({ type: 'skip_dj' });
            }
            refs.dispatchRef.current({ type: 'advance' });
            // Parity with the Next button: the skipped-to track gets its own Cue —
            // the DJ talks over its intro (segue). See ADR-0004 amendment.
            refs.liveRef.current?.send({ type: 'cue_dj', track_index: cur.currentTrackIndex + 1 });
          } else if (msg.intent.type === 'pause_playback') {
            refs.dispatchRef.current({
              type: 'set_playback',
              paused: msg.intent.action === 'pause',
            });
          } else if (msg.intent.type === 'host_mode_changed') {
            refs.dispatchRef.current({
              type: 'set_host_mode',
              hostMode: msg.intent.host_mode,
            });
          }
        } else if (msg.type === 'error') {
          console.error('[live]', msg.message);
          if (refs.stateRef.current.currentTrackIndex === 0) releaseOpening();
        }
      },
    });
    refs.liveRef.current = handle;
    return () => {
      handle.close();
      refs.liveRef.current = null;
    };
  }, [refs, liveWsUrl, onLivePhase, releaseOpening]);
}
