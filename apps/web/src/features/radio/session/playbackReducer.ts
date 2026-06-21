import type { CreateSessionResponse, Phase } from '@auracle/shared';
import { getTrackMeta } from '@/data/trackCatalog';
import { DEMO_SESSION } from '@/data/demoData';
import type { PlaybackState, TranscriptLine, UiPhase } from '@/features/radio/session/types';

export type PlaybackAction =
  | { type: 'reset' }
  | { type: 'begin' }
  | { type: 'start'; session: CreateSessionResponse }
  | { type: 'tick' }
  | { type: 'progress'; progressSec: number }
  | { type: 'duration'; durationSec: number }
  | { type: 'toggle_pause' }
  | { type: 'set_playback'; paused: boolean }
  | { type: 'advance' }
  | { type: 'enter_break' }
  | { type: 'start_talk' }
  | { type: 'stop_talk' }
  | { type: 'transcript'; role: 'user' | 'model'; text: string }
  | { type: 'server_phase'; phase: Phase; trackIndex?: number }
  | { type: 'tracklist_updated'; remainingIds: string[]; sessionTitle?: string; sessionSubtitle?: string }
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
    albumTitle: meta.albumTitle,
    albumCoverUrl: meta.albumCoverUrl,
    artistPhotoUrl: meta.artistPhotoUrl,
    lore: meta.lore,
    durationSec: meta.durationSec,
    progressSec: 0,
    sessionElapsedSec: 0,
    transcript: [],
    activeTranscriptId: null,
    remainingTrackIds: DEMO_SESSION.tracklist.slice(1).map((t) => t.id),
    currentTrackIndex: 0,
    proxyUrl: null,
    token: null,
    inBreak: false,
    isTalking: false,
    userUtteranceCount: 0,
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
    return { ...state, phase: 'idle', progressSec: state.durationSec, inBreak: false, isTalking: false };
  }
  const meta = getTrackMeta(nextId);
  return {
    ...state,
    inBreak: false,
    isTalking: false,
    phase: 'playing',
    trackId: nextId,
    trackTitle: meta.title,
    artist: meta.artist,
    albumTitle: meta.albumTitle,
    albumCoverUrl: meta.albumCoverUrl,
    artistPhotoUrl: meta.artistPhotoUrl,
    lore: meta.lore,
    durationSec: meta.durationSec,
    progressSec: 0,
    currentTrackIndex: state.currentTrackIndex + 1,
    remainingTrackIds: state.remainingTrackIds.slice(1),
  };
}

const SESSION_CLOCK_PHASES: UiPhase[] = ['playing', 'speaking', 'listening', 'opening'];

/**
 * Map a relay phase frame to the UiPhase it produces in isolation. Context-dependent
 * overrides (break → listening) and the Playhead fence live in the `server_phase`
 * case below; `null` means the frame carries no UiPhase of its own.
 */
export function mapServerPhase(phase: Phase): 'speaking' | 'listening' | 'playing' | null {
  switch (phase) {
    case 'dj_turn_start':
      return 'speaking';
    case 'dj_turn_end':
      return 'playing';
    case 'user_barge_in':
      return 'listening';
    default:
      return null;
  }
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'reset':
      return createInitialPlaybackState();
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
        albumTitle: meta.albumTitle,
        albumCoverUrl: meta.albumCoverUrl,
        artistPhotoUrl: meta.artistPhotoUrl,
        lore: meta.lore,
        durationSec: meta.durationSec,
        progressSec: 0,
        sessionElapsedSec: 0,
        transcript: [],
        activeTranscriptId: null,
        remainingTrackIds: action.session.tracklist.slice(1).map((t) => t.id),
        currentTrackIndex: 0,
        proxyUrl: action.session.proxy_url,
        token: action.session.token,
        inBreak: false,
        isTalking: false,
        userUtteranceCount: 0,
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
      // A new user line (activeId changed) is one fresh utterance — drives the
      // talk-window silence/turn cap (ADR-0004).
      const newUserUtterance = action.role === 'user' && activeId !== state.activeTranscriptId;
      return {
        ...state,
        transcript: lines,
        activeTranscriptId: activeId,
        userUtteranceCount: state.userUtteranceCount + (newUserUtterance ? 1 : 0),
      };
    }
    case 'enter_break':
      return state.inBreak ? state : { ...state, inBreak: true };
    case 'start_talk':
      if (state.phase === 'idle' || state.phase === 'curating' || state.phase === 'paused') return state;
      return { ...state, isTalking: true };
    case 'stop_talk':
      return { ...state, isTalking: false };
    case 'server_phase': {
      if (state.phase === 'paused') return state;
      // A phase frame stamped with an older Playhead is a stale DJ turn (e.g. the
      // listener skipped mid-turn) — drop it so it can't poison the new track's
      // phase and silence its Cue (CONTEXT: Playhead fence).
      if (action.trackIndex !== undefined && action.trackIndex < state.currentTrackIndex) return state;
      const next = mapServerPhase(action.phase);
      if (!next) return state;
      // During a break, a DJ turn ending opens the listening window instead of
      // resuming playback (ADR-0004).
      const phase = action.phase === 'dj_turn_end' && state.inBreak ? 'listening' : next;
      const finalize = action.phase === 'dj_turn_end' || action.phase === 'user_barge_in';
      return {
        ...state,
        phase,
        activeTranscriptId: finalize ? null : state.activeTranscriptId,
      };
    }
    case 'tracklist_updated':
      return {
        ...state,
        remainingTrackIds: action.remainingIds,
        sessionTitle: action.sessionTitle ?? state.sessionTitle,
        sessionSubtitle: action.sessionSubtitle ?? state.sessionSubtitle,
      };
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
