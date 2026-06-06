import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { CreateSessionResponse, Phase } from '@auracle/shared';
import { AppShell } from './components/AppShell';
import { ContentSheet } from './components/ContentSheet';
import { MiniControlBar } from './components/MiniControlBar';
import { StageHeader } from './components/StageHeader';
import { TrackQueue } from './components/TrackQueue';
import { useLayoutMode } from './hooks/useMediaQuery';
import { DJ_NAME } from './lib/constants';
import { connectLiveSession, mapServerPhase } from './lib/liveSession';
import { fetchTrack, getTrackMeta, prefetchTracks } from './lib/trackCatalog';
import { DEMO_SESSION } from './mock/demoData';
import type { PlaybackState, TranscriptLine } from './types';

type Action =
  | { type: 'start'; session: CreateSessionResponse }
  | { type: 'tick' }
  | { type: 'toggle_pause' }
  | { type: 'transcript'; role: 'user' | 'model'; text: string }
  | { type: 'server_phase'; phase: Phase }
  | { type: 'tracklist_updated'; remainingIds: string[] };

function initialState(): PlaybackState {
  const first = DEMO_SESSION.tracklist[0]!;
  const meta = getTrackMeta(first.id);
  return {
    phase: 'idle',
    sessionTitle: DEMO_SESSION.session_title,
    sessionSubtitle: DEMO_SESSION.session_subtitle,
    trackId: first.id,
    trackTitle: meta.title,
    artist: meta.artist,
    durationSec: meta.durationSec,
    progressSec: 0,
    sessionElapsedSec: 0,
    transcript: [],
    activeTranscriptId: null,
    remainingTrackIds: DEMO_SESSION.tracklist.slice(1).map((t) => t.id),
    currentTrackIndex: 0,
    liveWsUrl: null,
  };
}

function appendTranscript(
  lines: TranscriptLine[],
  role: 'user' | 'model',
  text: string,
  elapsedSec: number,
): { lines: TranscriptLine[]; activeId: string } {
  const last = lines[lines.length - 1];
  if (last && last.role === role) {
    const updated = { ...last, text: last.text + text };
    return { lines: [...lines.slice(0, -1), updated], activeId: last.id };
  }
  const id = `t-${lines.length}-${Date.now()}`;
  const line: TranscriptLine = { id, role, text, elapsedSec };
  return { lines: [...lines, line], activeId: id };
}

function reducer(state: PlaybackState, action: Action): PlaybackState {
  switch (action.type) {
    case 'start': {
      const first = action.session.tracklist[0]!;
      const meta = getTrackMeta(first.id);
      return {
        ...state,
        phase: 'playing',
        sessionTitle: action.session.session_title,
        sessionSubtitle: action.session.session_subtitle,
        trackId: first.id,
        trackTitle: meta.title,
        artist: meta.artist,
        durationSec: meta.durationSec,
        progressSec: 0,
        sessionElapsedSec: 0,
        transcript: [],
        activeTranscriptId: null,
        remainingTrackIds: action.session.tracklist.slice(1).map((t) => t.id),
        currentTrackIndex: 0,
        liveWsUrl: action.session.live_ws_url,
      };
    }
    case 'transcript': {
      if (!action.text) return state;
      const { lines, activeId } = appendTranscript(
        state.transcript,
        action.role,
        action.text,
        state.sessionElapsedSec,
      );
      return { ...state, transcript: lines, activeTranscriptId: activeId };
    }
    case 'server_phase': {
      if (state.phase === 'paused') return state;
      const next = mapServerPhase(action.phase);
      return next ? { ...state, phase: next } : state;
    }
    case 'tracklist_updated':
      return { ...state, remainingTrackIds: action.remainingIds };
    case 'tick': {
      if (state.phase !== 'playing' && state.phase !== 'speaking' && state.phase !== 'listening') {
        return state;
      }
      const progressSec = state.progressSec + 1;
      const sessionElapsedSec = state.sessionElapsedSec + 1;
      if (progressSec >= state.durationSec) {
        return { ...state, progressSec: state.durationSec, sessionElapsedSec };
      }
      return { ...state, progressSec, sessionElapsedSec };
    }
    case 'toggle_pause': {
      if (state.phase === 'idle') return state;
      if (state.phase === 'paused') return { ...state, phase: 'playing' };
      return { ...state, phase: 'paused' };
    }
    default:
      return state;
  }
}

async function createSession(): Promise<CreateSessionResponse> {
  try {
    const res = await fetch('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood: 'calm', scene: 'study', duration_min: 25 }),
    });
    if (res.ok) return (await res.json()) as CreateSessionResponse;
  } catch {
    /* demo fallback */
  }
  return DEMO_SESSION;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const handleStart = useCallback(async () => {
    const session = await createSession();
    const ids = session.tracklist.map((t) => t.id);
    await prefetchTracks(ids);
    if (ids[0]) await fetchTrack(ids[0]);
    dispatch({ type: 'start', session });
  }, []);

  const handleTogglePause = useCallback(() => {
    dispatch({ type: 'toggle_pause' });
  }, []);

  useEffect(() => {
    if (!state.liveWsUrl) return;

    const cleanup = connectLiveSession(state.liveWsUrl, (msg) => {
      if (msg.type === 'transcript') {
        dispatchRef.current({ type: 'transcript', role: msg.role, text: msg.text });
      } else if (msg.type === 'phase') {
        dispatchRef.current({ type: 'server_phase', phase: msg.phase });
      } else if (msg.type === 'tracklist_updated') {
        const remainingIds = msg.remaining.map((t) => t.id);
        void prefetchTracks(remainingIds);
        dispatchRef.current({ type: 'tracklist_updated', remainingIds });
      } else if (msg.type === 'error') {
        console.error('[live]', msg.message);
      }
    });

    return cleanup;
  }, [state.liveWsUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        handleTogglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleTogglePause]);

  useEffect(() => {
    if (state.phase !== 'playing' && state.phase !== 'speaking' && state.phase !== 'listening') {
      return;
    }
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  const { isWide } = useLayoutMode();

  return (
    <AppShell
      stage={<StageHeader djName={DJ_NAME} phase={state.phase} sessionElapsedSec={state.sessionElapsedSec} />}
      sheet={
        <ContentSheet
          phase={state.phase}
          sessionTitle={state.sessionTitle}
          sessionSubtitle={state.sessionSubtitle}
          trackTitle={state.trackTitle}
          artist={state.artist}
          progressSec={state.progressSec}
          durationSec={state.durationSec}
          transcript={state.transcript}
          activeTranscriptId={state.activeTranscriptId}
          djName={DJ_NAME}
          onTogglePause={handleTogglePause}
          onStart={handleStart}
        />
      }
      queue={isWide ? <TrackQueue currentTrackId={state.trackId} remainingTrackIds={state.remainingTrackIds} /> : undefined}
      miniBar={
        <MiniControlBar
          phase={state.phase}
          progressSec={state.progressSec}
          durationSec={state.durationSec}
          onTogglePause={handleTogglePause}
        />
      }
    />
  );
}
