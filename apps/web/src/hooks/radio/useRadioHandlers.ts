import { useCallback } from 'react';
import type { HostMode, SessionIntent } from '@auracle/shared';
import { createAudioBus } from '../../lib/liveAudio';
import { createSession, postHostMode, postSessionEvent } from '../../lib/sessionApi';
import { prefetchTracks } from '../../lib/trackCatalog';
import type { RadioCommands } from '../../lib/radioCommands';
import type { AudioRefs, StoreRefs } from './sessionRefs';

export interface RadioHandlers {
  handleStart: (intent: SessionIntent) => Promise<void>;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleSkipDj: () => void;
  handleContinue: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
  handleTalkStart: () => void;
  handleTalkEnd: () => void;
  handleSendText: (text: string) => void;
}

interface RadioHandlersInput {
  store: StoreRefs;
  audio: AudioRefs;
  commands: RadioCommands;
  setAnalyser: (analyser: AnalyserNode | null) => void;
}

export function useRadioHandlers({
  store,
  audio,
  commands,
  setAnalyser,
}: RadioHandlersInput): RadioHandlers {
  const handleStart = useCallback(async (intent: SessionIntent) => {
    const el = audio.audioRef.current ?? (audio.audioRef.current = new Audio());
    if (!audio.audioBusRef.current) {
      const bus = createAudioBus();
      bus.attachMusicElement(el);
      audio.audioBusRef.current = bus;
      setAnalyser(bus.getAnalyser());
    }
    await audio.audioBusRef.current.resume();
    store.dispatchRef.current({ type: 'begin' });
    const session = await createSession(intent);
    void prefetchTracks(session.tracklist.map((t) => t.id));
    store.dispatchRef.current({ type: 'start', session });
  }, [store, audio, setAnalyser]);

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

  // "Continue ▶": end the talk break now and move to the next track.
  const handleContinue = useCallback(() => {
    if (!store.stateRef.current.inBreak) return;
    store.dispatchRef.current({ type: 'advance' });
  }, [store]);

  const handleSkipTrack = useCallback(() => {
    // Snapshot the skipped track before the command advances the Playhead, then
    // log analytics only for this user-initiated skip (remote DJ-tool skips are
    // recorded server-side by the relay).
    const s = store.stateRef.current;
    if (commands.skipTrack()) {
      postSessionEvent(s.sessionId!, 'track_skipped', { track_id: s.trackId });
    }
  }, [store, commands]);

  const handleSkipDj = useCallback(() => {
    commands.skipVoiceOver();
  }, [commands]);

  const handleTalkStart = useCallback(() => {
    commands.startTalk();
  }, [commands]);

  const handleTalkEnd = useCallback(() => {
    commands.endTalk();
  }, [commands]);

  const handleSendText = useCallback((text: string) => {
    commands.sendText(text);
  }, [commands]);

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
    handleTogglePause,
    handleSkipTrack,
    handleSkipDj,
    handleContinue,
    handleChangeHostMode,
    handleTalkStart,
    handleTalkEnd,
    handleSendText,
  };
}
