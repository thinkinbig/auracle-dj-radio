import type { CreateSessionResponse, Phase } from '@auracle/shared';
import { mapServerPhase } from './liveSession';
import { getTrackMeta } from './trackCatalog';
import { DEMO_SESSION } from '../mock/demoData';
import type { PlaybackState, TranscriptLine, UiPhase } from '../types';

export type PlaybackAction =
  | { type: 'begin' }
  | { type: 'start'; session: CreateSessionResponse }
  | { type: 'tick' }
  | { type: 'progress'; progressSec: number }
  | { type: 'duration'; durationSec: number }
  | { type: 'toggle_pause' }
  | { type: 'set_playback'; paused: boolean }
  | { type: 'advance' }
  | { type: 'transcript'; role: 'user' | 'model'; text: string }
  | { type: 'server_phase'; phase: Phase }
  | { type: 'tracklist_updated'; remainingIds: string[] }
  | { type: 'set_host_mode'; hostMode: CreateSessionResponse['host_mode'] };

export function createInitialPlaybackState(): PlaybackState {
  const first = DEMO_SESSION.tracklist[0]!;
  const meta = getTrackMeta(first.id);
  return {
    phase: 'idle',
    sessionId: null,
    hostMode: DEMO_SESSION.host_mode,
    liveWarning: null,
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

/** Replace the active same-role line (streaming cumulative text from relay). */
export function updateTranscript(
  lines: TranscriptLine[],
  activeId: string | null,
  role: 'user' | 'model',
  text: string,
  elapsedSec: number,
): { lines: TranscriptLine[]; activeId: string } {
  const last = lines[lines.length - 1];
  if (activeId && last?.id === activeId && last.role === role) {
    return { lines: [...lines.slice(0, -1), { ...last, text }], activeId };
  }
  const id = `t-${lines.length}-${Date.now()}`;
  const line: TranscriptLine = { id, role, text, elapsedSec };
  return { lines: [...lines, line], activeId: id };
}

function advanceTrack(state: PlaybackState): PlaybackState {
  const nextId = state.remainingTrackIds[0];
  if (!nextId) {
    return { ...state, phase: 'idle', progressSec: state.durationSec };
  }
  const meta = getTrackMeta(nextId);
  return {
    ...state,
    phase: 'playing',
    trackId: nextId,
    trackTitle: meta.title,
    artist: meta.artist,
    durationSec: meta.durationSec,
    progressSec: 0,
    currentTrackIndex: state.currentTrackIndex + 1,
    remainingTrackIds: state.remainingTrackIds.slice(1),
  };
}

const SESSION_CLOCK_PHASES: UiPhase[] = ['playing', 'speaking', 'listening', 'opening'];

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'begin':
      return { ...state, phase: 'curating', transcript: [], activeTranscriptId: null };
    case 'start': {
      const first = action.session.tracklist[0]!;
      const meta = getTrackMeta(first.id);
      const isDemoFallback = action.session.session_id === DEMO_SESSION.session_id;
      return {
        ...state,
        phase: 'opening',
        sessionId: action.session.session_id,
        hostMode: action.session.host_mode,
        liveWarning: isDemoFallback
          ? 'API unavailable: Live opening voice-over is disabled in demo fallback.'
          : null,
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
      const { lines, activeId } = updateTranscript(
        state.transcript,
        state.activeTranscriptId,
        action.role,
        action.text,
        state.sessionElapsedSec,
      );
      return { ...state, transcript: lines, activeTranscriptId: activeId };
    }
    case 'server_phase': {
      if (state.phase === 'paused') return state;
      const next = mapServerPhase(action.phase);
      if (!next) return state;
      const finalize = action.phase === 'dj_turn_end' || action.phase === 'user_barge_in';
      return {
        ...state,
        phase: next,
        activeTranscriptId: finalize ? null : state.activeTranscriptId,
      };
    }
    case 'tracklist_updated':
      return { ...state, remainingTrackIds: action.remainingIds };
    case 'set_host_mode':
      return { ...state, hostMode: action.hostMode };
    case 'tick':
      if (!SESSION_CLOCK_PHASES.includes(state.phase)) return state;
      return { ...state, sessionElapsedSec: state.sessionElapsedSec + 1 };
    case 'progress':
      return { ...state, progressSec: action.progressSec };
    case 'duration':
      return Number.isFinite(action.durationSec) && action.durationSec > 0
        ? { ...state, durationSec: action.durationSec }
        : state;
    case 'advance':
      return advanceTrack(state);
    case 'set_playback':
      if (state.phase === 'idle' || state.phase === 'curating') return state;
      return { ...state, phase: action.paused ? 'paused' : 'playing' };
    case 'toggle_pause':
      if (state.phase === 'idle' || state.phase === 'curating') return state;
      if (state.phase === 'paused') return { ...state, phase: 'playing' };
      return { ...state, phase: 'paused' };
    default:
      return state;
  }
}
