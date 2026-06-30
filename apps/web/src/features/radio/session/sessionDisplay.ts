import { getTrackMeta } from '@/data/trackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
import type { SessionHistoryEntry } from './sessionHistory';
import type { PlaybackState } from './types';

export interface SessionTimelineItem {
  title: string;
  detail: string;
}

export interface GeneratedSessionItem {
  title: string;
  detail: string;
  status: string;
}

export function hasStartedSession(state: PlaybackState): boolean {
  return state.phase !== 'idle' || state.sessionId !== null;
}

export function formatSavedAt(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

export function formatSessionDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

export function deriveSessionTitle(
  hasSession: boolean,
  state: PlaybackState,
  latestSaved?: SessionHistoryEntry,
): string {
  if (hasSession) return state.sessionTitle;
  return latestSaved?.title ?? 'No sessions yet';
}

export function deriveSessionDurationLabel(
  hasSession: boolean,
  state: PlaybackState,
  latestSaved?: SessionHistoryEntry,
): string {
  if (hasSession) {
    return state.sessionElapsedSec > 0 ? formatTime(state.sessionElapsedSec) : 'Just started';
  }
  return latestSaved ? formatTime(latestSaved.durationSec) : 'Just started';
}

export function deriveSessionTimeline(
  hasSession: boolean,
  state: PlaybackState,
  latestSaved?: SessionHistoryEntry,
): SessionTimelineItem[] {
  if (hasSession) {
    return deriveLiveSessionTimeline(state);
  }
  if (latestSaved) {
    return latestSaved.tracks.slice(0, 3).map((track) => ({
      title: track.title,
      detail: track.artist,
    }));
  }
  return [
    { title: 'Choose a mood', detail: 'Start with one signal' },
    { title: 'Build your flow', detail: 'Auracle shapes the station' },
    { title: 'Save the story', detail: 'Sessions appear in History' },
  ];
}

function deriveLiveSessionTimeline(state: PlaybackState): SessionTimelineItem[] {
  const items: SessionTimelineItem[] = [];

  if (state.trackTitle) {
    items.push({
      title: state.trackTitle,
      detail: state.sessionSubtitle || 'Now playing',
    });
  }

  const upcoming = state.sessionTracklist.slice(state.currentTrackIndex + 1, state.currentTrackIndex + 3);
  for (const track of upcoming) {
    const meta = getTrackMeta(track.id);
    items.push({ title: meta.title, detail: meta.artist });
  }

  while (items.length < 3) {
    items.push({ title: 'Up next', detail: 'More tracks in flow' });
  }

  return items.slice(0, 3);
}

export function deriveGeneratedSessions(
  hasSession: boolean,
  state: PlaybackState,
  history: SessionHistoryEntry[],
): GeneratedSessionItem[] {
  if (hasSession) {
    return [
      {
        title: state.sessionTitle,
        detail: state.sessionSubtitle || 'Current station',
        status: state.phase === 'playing' ? 'Playing now' : 'Current session',
      },
    ];
  }
  return history.slice(0, 3).map((session) => ({
    title: session.title,
    detail: session.subtitle || `${session.trackCount} tracks`,
    status: formatSavedAt(session.savedAt),
  }));
}

export function deriveSessionMeta(hasSession: boolean, playback: PlaybackState): {
  title: string;
  meta: string;
  action: string;
} {
  return {
    title: hasSession ? playback.sessionTitle : 'No session yet',
    meta: hasSession
      ? `${playback.sessionSubtitle} · ${formatSessionDuration(playback.sessionElapsedSec)}`
      : 'Choose a mood to begin',
    action: hasSession ? 'Resume' : 'Start',
  };
}
