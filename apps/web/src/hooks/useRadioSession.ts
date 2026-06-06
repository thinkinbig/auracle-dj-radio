import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { HostMode, Phase } from '@auracle/shared';
import { createAudioBus, startMicCapture, type AudioBus, type MicCapture } from '../lib/liveAudio';
import { createOpeningController, type OpeningController } from '../lib/openingController';
import {
  MUSIC_VOLUME,
  musicVolume,
  shouldPlayMusic,
  isSessionClockRunning,
} from '../lib/playbackCoordinator';
import {
  createInitialPlaybackState,
  playbackReducer,
  type PlaybackAction,
} from '../lib/playbackReducer';
import { connectLiveSession, type LiveSessionHandle } from '../lib/liveSession';
import { createSession, postHostMode, postSessionEvent } from '../lib/sessionApi';
import { prefetchTracks } from '../lib/trackCatalog';
import type { PlaybackState } from '../types';

export interface RadioSession {
  state: PlaybackState;
  analyser: AnalyserNode | null;
  handleStart: () => Promise<void>;
  handleTogglePause: () => void;
  handleSkipTrack: () => void;
  handleChangeHostMode: (hostMode: HostMode) => void;
}

/** Owns Live WS, track playback, opening gate, duck, and mic for one radio session. */
export function useRadioSession(): RadioSession {
  const [state, dispatch] = useReducer(playbackReducer, undefined, createInitialPlaybackState);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [openingReleased, setOpeningReleased] = useState(true);

  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const stateRef = useRef(state);
  stateRef.current = state;

  const liveRef = useRef<LiveSessionHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBusRef = useRef<AudioBus | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const skipGuardRef = useRef(false);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const openingRef = useRef<OpeningController | null>(null);

  const applyPlaybackPolicy = useCallback(() => {
    const bus = audioBusRef.current;
    const audio = audioRef.current;
    const s = stateRef.current;
    if (!bus || !audio) return;

    const policy = {
      phase: s.phase,
      currentTrackIndex: s.currentTrackIndex,
      openingReleased,
    };
    bus.setMusicVolume(musicVolume(policy));
    if (s.phase === 'paused') audio.pause();
    else if (shouldPlayMusic(policy)) void audio.play().catch(() => {});
  }, [openingReleased]);

  const notifyOpeningReleased = useCallback(() => {
    setOpeningReleased(true);
    const bus = audioBusRef.current;
    const s = stateRef.current;
    if (bus && s.currentTrackIndex === 0) bus.setMusicVolume(MUSIC_VOLUME.full, 0);
    const audio = audioRef.current;
    if (audio && s.phase !== 'paused' && s.phase !== 'idle' && s.phase !== 'curating') {
      void audio.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    openingRef.current = createOpeningController(notifyOpeningReleased);
    return () => openingRef.current?.dispose();
  }, [notifyOpeningReleased]);

  const releaseOpening = useCallback(() => {
    openingRef.current?.release();
  }, []);

  const handleStart = useCallback(async () => {
    const audio = audioRef.current ?? (audioRef.current = new Audio());
    if (!audioBusRef.current) {
      const bus = createAudioBus();
      bus.attachMusicElement(audio);
      audioBusRef.current = bus;
      setAnalyser(bus.getAnalyser());
    }
    await audioBusRef.current.resume();
    dispatch({ type: 'begin' });
    const session = await createSession();
    void prefetchTracks(session.tracklist.map((t) => t.id));
    dispatch({ type: 'start', session });
  }, []);

  const handleTogglePause = useCallback(() => {
    dispatch({ type: 'toggle_pause' });
  }, []);

  const handleSkipTrack = useCallback(() => {
    const s = stateRef.current;
    if (!s.sessionId || s.phase === 'idle' || s.phase === 'curating') return;
    if (s.remainingTrackIds.length === 0) return;

    skipGuardRef.current = true;
    audioRef.current?.pause();
    if (s.currentTrackIndex === 0) releaseOpening();

    postSessionEvent(s.sessionId, 'track_skipped', { track_id: s.trackId });
    dispatchRef.current({ type: 'advance' });
  }, [releaseOpening]);

  const handleChangeHostMode = useCallback((hostMode: HostMode) => {
    const s = stateRef.current;
    if (!s.sessionId || s.hostMode === hostMode) return;
    dispatchRef.current({ type: 'set_host_mode', hostMode });
    void postHostMode(s.sessionId, hostMode).then((ok) => {
      if (!ok) console.error('[host_mode] failed to update');
    });
  }, []);

  const onLivePhase = useCallback(
    (phase: Phase, trackIndex: number) => {
      const bus = audioBusRef.current;
      if (phase === 'dj_turn_start' && bus) bus.resumeDj();
      if (phase === 'dj_turn_end' && trackIndex === 0) releaseOpening();
      dispatchRef.current({ type: 'server_phase', phase });
    },
    [releaseOpening],
  );

  useEffect(() => {
    if (!state.liveWsUrl) return;
    const bus = audioBusRef.current;
    if (!bus) return;

    const handle = connectLiveSession(state.liveWsUrl, {
      onOpen: () => setLiveReady(true),
      onClose: () => {
        setLiveReady(false);
        if (stateRef.current.currentTrackIndex === 0) releaseOpening();
      },
      onAudio: (pcm) => bus.playDj(pcm),
      onMessage: (msg) => {
        if (msg.type === 'transcript') {
          dispatchRef.current({ type: 'transcript', role: msg.role, text: msg.text });
        } else if (msg.type === 'phase') {
          onLivePhase(msg.phase, msg.track_index);
        } else if (msg.type === 'tracklist_updated') {
          const remainingIds = msg.remaining.map((t) => t.id);
          void prefetchTracks(remainingIds);
          dispatchRef.current({ type: 'tracklist_updated', remainingIds });
        } else if (msg.type === 'intent') {
          if (msg.intent.type === 'skip_track') {
            skipGuardRef.current = true;
            audioRef.current?.pause();
            dispatchRef.current({ type: 'advance' });
          } else if (msg.intent.type === 'pause_playback') {
            dispatchRef.current({ type: 'set_playback', paused: msg.intent.action === 'pause' });
          } else if (msg.intent.type === 'host_mode_changed') {
            dispatchRef.current({ type: 'set_host_mode', hostMode: msg.intent.host_mode });
          }
        } else if (msg.type === 'error') {
          console.error('[live]', msg.message);
          if (stateRef.current.currentTrackIndex === 0) releaseOpening();
        }
      },
    });
    liveRef.current = handle;
    return () => {
      handle.close();
      liveRef.current = null;
      setLiveReady(false);
    };
  }, [state.liveWsUrl, onLivePhase, releaseOpening]);

  useEffect(() => {
    if (!state.sessionId) return;

    const isOpening = state.currentTrackIndex === 0;
    const opening = openingRef.current!;
    if (isOpening) {
      setOpeningReleased(false);
      opening.armForTrack(0);
    } else {
      setOpeningReleased(true);
      opening.armForTrack(state.currentTrackIndex);
    }

    postSessionEvent(state.sessionId, 'track_started', { track_id: state.trackId });
    liveRef.current?.send({ type: 'cue_dj', track_index: state.currentTrackIndex });

    const audio = audioRef.current;
    if (audio) {
      audio.preload = 'auto';
      audio.src = `/tracks/${state.trackId}/audio`;
      audio.load();
      audio.pause();
      audio.currentTime = 0;
      if (!isOpening) void audio.play().catch(() => {});
    }

    const nextId = state.remainingTrackIds[0];
    if (nextId) {
      const pre = preloadRef.current ?? (preloadRef.current = new Audio());
      pre.preload = 'auto';
      pre.src = `/tracks/${nextId}/audio`;
    }

    return () => opening.dispose();
  }, [state.sessionId, state.currentTrackIndex, state.trackId, releaseOpening]);

  useEffect(() => {
    const audio = audioRef.current ?? (audioRef.current = new Audio());
    const onTime = () =>
      dispatchRef.current({ type: 'progress', progressSec: Math.floor(audio.currentTime) });
    const onMeta = () =>
      dispatchRef.current({ type: 'duration', durationSec: Math.floor(audio.duration) });
    const onEnded = () => {
      if (skipGuardRef.current) {
        skipGuardRef.current = false;
        return;
      }
      dispatchRef.current({ type: 'advance' });
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
    };
  }, []);

  useEffect(() => {
    applyPlaybackPolicy();
  }, [state.phase, state.currentTrackIndex, openingReleased, applyPlaybackPolicy]);

  useEffect(() => {
    if (!state.sessionId) return;
    let cancelled = false;
    startMicCapture((pcm) => liveRef.current?.sendAudio(pcm))
      .then((mic) => {
        if (cancelled) mic.stop();
        else micRef.current = mic;
      })
      .catch((err) => console.error('[mic]', err));
    return () => {
      cancelled = true;
      micRef.current?.stop();
      micRef.current = null;
    };
  }, [state.sessionId]);

  useEffect(() => {
    if (!isSessionClockRunning(state.phase)) return;
    const id = setInterval(() => dispatch({ type: 'tick' } satisfies PlaybackAction), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  return {
    state,
    analyser,
    handleStart,
    handleTogglePause,
    handleSkipTrack,
    handleChangeHostMode,
  };
}
