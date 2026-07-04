import { useCallback } from 'react';
import type { HostMode, SessionIntent } from '@auracle/shared';
import { createAudioBus } from '../lib/liveAudio';
import { createSession, extendSession, postHostMode, postPlaylistFeedback, postSkipTrack, SessionAuthError } from '../lib/sessionApi';
import { DEMO_SESSION } from '@/data/demoData';
import { prefetchTracks } from '@/data/trackCatalog';
import { gatherSpotifyCandidates, isSpotifyPlaybackEnabled } from '@/features/spotify/spotifyPlayback';
import { buildSpotifyTasteContext, canReadSpotifyTaste, getSpotifyTasteProfile } from '@/features/spotify/spotifyTaste';
import { queryKeys } from '@/shared/query/keys';
import { queryClient } from '@/shared/query/queryClient';
import type { RadioCommands } from '../lib/radioCommands';
import type { PlaylistFeedback } from '@/features/radio/session/types';
import type { AudioRefs, StoreRefs } from './sessionRefs';

export interface RadioHandlers {
  handleStart: (intent: SessionIntent) => Promise<void>;
  handleReturnToSetup: () => void;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleSkipDj: () => void;
  handleContinue: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
  handlePlaylistFeedback: (feedback: PlaylistFeedback) => void;
  handleRetryExtend: () => void;
  handleSendText: (text: string) => void;
}

interface RadioHandlersInput {
  store: StoreRefs;
  audio: AudioRefs;
  commands: RadioCommands;
  setAnalyser: (analyser: AnalyserNode | null) => void;
  onAuthExpired?: () => void;
}

export function useRadioHandlers({
  store,
  audio,
  commands,
  setAnalyser,
  onAuthExpired,
}: RadioHandlersInput): RadioHandlers {
  const handleStart = useCallback(async (intent: SessionIntent) => {
    try {
      const el = audio.audioRef.current ?? (audio.audioRef.current = new Audio());
      if (!audio.audioBusRef.current) {
        const bus = createAudioBus();
        bus.attachMusicElement(el);
        audio.audioBusRef.current = bus;
        setAnalyser(bus.getAnalyser());
      }
      await audio.audioBusRef.current.resume();
      store.dispatchRef.current({ type: 'begin' });
      // Gather the listener's Spotify library as seeds for the server to rank into
      // the queue (ADR-0005). Best-effort: a failure or non-Premium user just yields
      // a catalog-only session.
      const [seeds, spotifyTasteSummary] = await Promise.all([
        isSpotifyPlaybackEnabled()
          ? gatherSpotifyCandidates().catch(() => undefined)
          : Promise.resolve(undefined),
        readSpotifyTasteContext().catch(() => undefined),
      ]);
      const session = await createSession(intent, seeds, spotifyTasteSummary);
      void prefetchTracks(session.tracklist);
      store.dispatchRef.current({ type: 'start', session });
    } catch (err) {
      if (err instanceof SessionAuthError) {
        console.error('[radio] session auth expired');
        store.dispatchRef.current({ type: 'reset' });
        onAuthExpired?.();
        return;
      }
      console.error('[radio] start failed', err);
      void prefetchTracks(DEMO_SESSION.tracklist);
      store.dispatchRef.current({ type: 'start', session: DEMO_SESSION });
    }
  }, [store, audio, setAnalyser, onAuthExpired]);

  const handleTogglePause = useCallback(() => {
    // Pausing during a talk break closes the window (mic off via the listening
    // gate) and advances, landing paused on the next track (ADR-0004).
    if (store.stateRef.current.inBreak) {
      store.dispatchRef.current({ type: 'advance' });
      store.dispatchRef.current({ type: 'set_playback', paused: true });
      return;
    }
    store.dispatchRef.current({ type: 'toggle_pause' });
  }, [store]);

  const handleReturnToSetup = useCallback(() => {
    audio.audioRef.current?.pause();
    if (audio.audioRef.current) audio.audioRef.current.currentTime = 0;
    audio.audioBusRef.current?.skipDj();
    store.dispatchRef.current({ type: 'reset' });
    setAnalyser(audio.audioBusRef.current?.getAnalyser() ?? null);
  }, [store, audio, setAnalyser]);

  // "Continue ▶": end the talk break now and move to the next track.
  const handleContinue = useCallback(() => {
    if (!store.stateRef.current.inBreak) return;
    store.dispatchRef.current({ type: 'advance' });
  }, [store]);

  const handleSkipTrack = useCallback(() => {
    // Snapshot the skipped track before the command advances the Playhead, then
    // stamp the server skip path (same as the DJ tool) so skip latency / quick-skip
    // learning run when now_playing lands.
    const s = store.stateRef.current;
    const trackId = s.trackId;
    if (commands.skipTrack()) {
      postSkipTrack(s.sessionId!, trackId);
    }
  }, [store, commands]);

  const handleSkipDj = useCallback(() => {
    commands.skipVoiceOver();
  }, [commands]);

  const handleSendText = useCallback((text: string) => {
    commands.sendText(text);
  }, [commands]);

  const handlePlaylistFeedback = useCallback((feedback: PlaylistFeedback) => {
    const s = store.stateRef.current;
    if (s.phase === 'idle' || s.phase === 'curating' || !s.sessionId) return;
    store.dispatchRef.current({ type: 'playlist_feedback', feedback });
    void postPlaylistFeedback(s.sessionId, feedback).then((result) => {
      if (!result?.ok) {
        store.dispatchRef.current({ type: 'playlist_feedback_failed', feedback });
        return;
      }
      const regenerated = result.regenerate;
      if (!regenerated) return;
      void prefetchTracks(regenerated.remaining);
      store.dispatchRef.current({
        type: 'tracklist_updated',
        remaining: regenerated.remaining,
        sessionTitle: regenerated.session_title,
        sessionSubtitle: regenerated.session_subtitle,
        changedIds: regenerated.changed_ids,
        beforeRemainingIds: regenerated.before_remaining_ids,
      });
    });
  }, [store]);

  const handleRetryExtend = useCallback(() => {
    const s = store.stateRef.current;
    if (!s.sessionId || s.phase === 'idle' || s.phase === 'curating') return;
    void extendSession(s.sessionId).then((ok) => {
      if (!ok) store.dispatchRef.current({ type: 'queue_refresh', status: 'error' });
    });
  }, [store]);

  const handleChangeHostMode = useCallback(
    (hostMode: HostMode) => {
      const s = store.stateRef.current;
      if (!s.sessionId || s.hostMode === hostMode) return;
      store.dispatchRef.current({ type: 'set_host_mode', hostMode });
      void postHostMode(s.sessionId, hostMode).then((ok) => {
        if (!ok) console.error('[host_mode] failed to update');
      });
    },
    [store],
  );

  return {
    handleStart,
    handleReturnToSetup,
    handleTogglePause,
    handleSkipTrack,
    handleSkipDj,
    handleContinue,
    handleChangeHostMode,
    handlePlaylistFeedback,
    handleRetryExtend,
    handleSendText,
  };
}

async function readSpotifyTasteContext(): Promise<string | undefined> {
  if (canReadSpotifyTaste() !== 'ready') return undefined;
  const profile = await queryClient.fetchQuery({
    queryKey: queryKeys.spotifyTaste,
    queryFn: getSpotifyTasteProfile,
    staleTime: 5 * 60 * 1000,
  });
  return buildSpotifyTasteContext(profile);
}
