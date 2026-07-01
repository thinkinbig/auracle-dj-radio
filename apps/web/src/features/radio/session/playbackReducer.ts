import type { CreateSessionResponse, PlannedTrack, Phase } from '@auracle/shared';
import { getTrackMeta } from '@/data/trackCatalog';
import { sanitizeTranscriptText } from '@/features/radio/lib/transcriptText';
import { DEMO_SESSION } from '@/data/demoData';
import type { PlaybackState, PlaylistFeedback, QueueRefreshStatus, TranscriptLine, UiPhase } from '@/features/radio/session/types';

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
  | { type: 'skip_voice_over' }
  | { type: 'enter_break' }
  | { type: 'start_talk' }
  | { type: 'stop_talk' }
  | { type: 'transcript'; role: 'user' | 'model'; text: string }
  | { type: 'server_phase'; phase: Phase; trackIndex?: number }
  | {
      type: 'tracklist_updated';
      remaining: PlannedTrack[];
      sessionTitle?: string;
      sessionSubtitle?: string;
      changedIds?: string[];
      beforeRemainingIds?: string[];
    }
  | { type: 'playlist_feedback'; feedback: PlaylistFeedback }
  | { type: 'playlist_feedback_failed'; feedback: PlaylistFeedback }
  | { type: 'queue_refresh'; status: QueueRefreshStatus }
  | { type: 'set_host_mode'; hostMode: CreateSessionResponse['host_mode'] }
  | { type: 'session_superseded' };

const QUEUE_DIFF_TTL_SEC = 30;

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
    sessionTracklist: DEMO_SESSION.tracklist,
    remainingTrackIds: DEMO_SESSION.tracklist.slice(1).map((t) => t.id),
    currentTrackIndex: 0,
    proxyUrl: null,
    token: null,
    inBreak: false,
    isTalking: false,
    userUtteranceCount: 0,
    playlistFeedback: null,
    queueRefreshStatus: 'idle',
    recentlyChangedIds: [],
    queueDiffExpiresAtSec: null,
    queueDiffMessage: null,
    superseded: false,
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

/**
 * Display metadata for a slot. Catalog (`local:`) slots resolve from the catalog by
 * id; any other slot is self-describing — the planner stamped its inline metadata
 * and voicing, so read them straight off the slot (photo left blank; ADR-0005, #75).
 */
function trackMetaFromRef(
  ref: PlannedTrack | undefined,
  fallbackId: string,
): { title: string; artist: string; albumTitle: string; albumCoverUrl: string; artistPhotoUrl: string; lore: string; durationSec: number } {
  if (ref && !ref.uri.startsWith('local:')) {
    return { title: ref.title, artist: ref.artist, albumTitle: ref.albumTitle, albumCoverUrl: ref.albumCoverUrl, artistPhotoUrl: '', lore: ref.voicing.lore, durationSec: ref.durationSec };
  }
  return getTrackMeta(ref?.id ?? fallbackId);
}

function advanceTrack(state: PlaybackState): PlaybackState {
  const nextId = state.remainingTrackIds[0];
  if (!nextId) {
    if (state.queueRefreshStatus === 'pending' || state.queueRefreshStatus === 'error') {
      return {
        ...state,
        phase: 'complete',
        progressSec: state.durationSec,
        inBreak: false,
        isTalking: false,
      };
    }
    return { ...state, phase: 'idle', progressSec: state.durationSec, inBreak: false, isTalking: false };
  }
  const nextRef = state.sessionTracklist[state.currentTrackIndex + 1];
  const meta = trackMetaFromRef(nextRef, nextId);
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

function replaceRemainingTrackRefs(state: PlaybackState, remaining: PlannedTrack[]): PlannedTrack[] {
  const currentCutoff = state.currentTrackIndex + 1;
  const currentRef: PlannedTrack = state.sessionTracklist[state.currentTrackIndex] ?? {
    id: state.trackId,
    uri: `local:${state.trackId}`,
    flow_position: currentCutoff,
    reason: 'Now playing',
    title: '',
    artist: '',
    albumTitle: '',
    albumCoverUrl: '',
    durationSec: 0,
    energy: 3,
    voicing: { artistPersona: '', albumConcept: '', lore: '' },
  };
  const kept = state.sessionTracklist.length > 0
    ? state.sessionTracklist.slice(0, currentCutoff)
    : [currentRef];

  if (!kept[state.currentTrackIndex]) {
    kept[state.currentTrackIndex] = currentRef;
  }

  return [
    ...kept,
    ...remaining.map((ref, i) => ({
      ...ref,
      flow_position: currentCutoff + i + 1,
    })),
  ];
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function inferChangedIds(beforeIds: string[], afterRefs: PlannedTrack[]): string[] {
  const changed: string[] = [];
  const afterIds = afterRefs.map((ref) => ref.id);
  const max = Math.max(beforeIds.length, afterIds.length);
  for (let i = 0; i < max; i += 1) {
    const afterId = afterIds[i];
    if (afterId && beforeIds[i] !== afterId) changed.push(afterId);
  }
  return uniqueIds(changed);
}

function formatQueueDiffMessage(count: number): string {
  return `${count} upcoming ${count === 1 ? 'track' : 'tracks'} updated`;
}

function clearQueueDiff(state: PlaybackState): PlaybackState {
  if (state.recentlyChangedIds.length === 0 && state.queueDiffExpiresAtSec === null && !state.queueDiffMessage) {
    return state;
  }
  return {
    ...state,
    recentlyChangedIds: [],
    queueDiffExpiresAtSec: null,
    queueDiffMessage: null,
  };
}

function expireQueueDiff(state: PlaybackState, elapsedSec: number): PlaybackState {
  if (state.queueDiffExpiresAtSec !== null && elapsedSec >= state.queueDiffExpiresAtSec) {
    return clearQueueDiff(state);
  }
  return state;
}

const SESSION_CLOCK_PHASES: UiPhase[] = ['playing', 'speaking', 'listening', 'opening', 'complete'];

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
      const first = action.session.tracklist[0];
      if (!first) {
        return { ...state, phase: 'idle', liveWarning: 'Session has no tracks — try again or check the music-engine catalog.' };
      }
      const meta = trackMetaFromRef(first, first.id);
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
        sessionTracklist: action.session.tracklist,
        remainingTrackIds: action.session.tracklist.slice(1).map((t) => t.id),
        currentTrackIndex: 0,
        proxyUrl: action.session.proxy_url,
        token: action.session.token,
        inBreak: false,
        isTalking: false,
        userUtteranceCount: 0,
        playlistFeedback: null,
        queueRefreshStatus: 'idle',
        recentlyChangedIds: [],
        queueDiffExpiresAtSec: null,
        queueDiffMessage: null,
        superseded: false,
      };
    }
    case 'transcript': {
      const text = sanitizeTranscriptText(action.text, action.role);
      if (!text) return state;
      const { lines, activeId } = updateTranscript(
        state.transcript,
        state.activeTranscriptId,
        action.role,
        text,
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
      if (state.phase === 'idle' || state.phase === 'curating') return state;
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
    case 'tracklist_updated': {
      const sessionTracklist = replaceRemainingTrackRefs(state, action.remaining);
      const wasRefreshing = state.queueRefreshStatus === 'pending';
      const changedIds = uniqueIds(
        action.changedIds && action.changedIds.length > 0
          ? action.changedIds
          : inferChangedIds(action.beforeRemainingIds ?? state.remainingTrackIds, action.remaining),
      );
      const next: PlaybackState = {
        ...state,
        sessionTracklist,
        remainingTrackIds: action.remaining.map((ref) => ref.id),
        sessionTitle: action.sessionTitle ?? state.sessionTitle,
        sessionSubtitle: action.sessionSubtitle ?? state.sessionSubtitle,
        playlistFeedback: wasRefreshing && state.playlistFeedback === 'regenerate' ? 'regenerate' : state.playlistFeedback,
        queueRefreshStatus: wasRefreshing ? 'complete' : state.queueRefreshStatus,
        recentlyChangedIds: changedIds,
        queueDiffExpiresAtSec: changedIds.length > 0 ? state.sessionElapsedSec + QUEUE_DIFF_TTL_SEC : null,
        queueDiffMessage: changedIds.length > 0 ? formatQueueDiffMessage(changedIds.length) : null,
      };
      const queueWasEmpty = state.remainingTrackIds.length === 0;
      if (queueWasEmpty && action.remaining.length > 0 && (state.phase === 'complete' || wasRefreshing)) {
        return advanceTrack(next);
      }
      return next;
    }
    case 'queue_refresh':
      return { ...state, queueRefreshStatus: action.status };
    case 'playlist_feedback':
      // The signal is posted to the server for analytics/personalization; the
      // queue itself only changes when the server pushes `tracklist_updated`.
      return {
        ...state,
        playlistFeedback: action.feedback,
        queueRefreshStatus: action.feedback === 'regenerate' ? 'pending' : 'idle',
      };
    case 'playlist_feedback_failed':
      return {
        ...state,
        playlistFeedback: action.feedback,
        queueRefreshStatus: action.feedback === 'regenerate' ? 'error' : state.queueRefreshStatus,
      };
    case 'set_host_mode':
      return { ...state, hostMode: action.hostMode };
    case 'session_superseded':
      // The user started a set on another device — stop playback here and flag
      // the "playing elsewhere" UX (issue #55). Pause rather than reset so the
      // overlay can show what was playing and offer a clean restart.
      return { ...state, phase: 'paused', isTalking: false, superseded: true };
    case 'tick':
      if (!SESSION_CLOCK_PHASES.includes(state.phase)) return state;
      return expireQueueDiff({ ...state, sessionElapsedSec: state.sessionElapsedSec + 1 }, state.sessionElapsedSec + 1);
    case 'progress':
      return { ...state, progressSec: action.progressSec };
    case 'duration':
      return Number.isFinite(action.durationSec) && action.durationSec > 0
        ? { ...state, durationSec: action.durationSec }
        : state;
    case 'advance':
      return advanceTrack(state);
    case 'skip_voice_over':
      if (state.phase !== 'speaking') return state;
      return {
        ...state,
        phase: state.inBreak ? 'listening' : 'playing',
        activeTranscriptId: null,
      };
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
