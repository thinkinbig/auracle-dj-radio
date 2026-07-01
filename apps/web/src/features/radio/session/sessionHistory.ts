import { getTrackMeta } from '@/data/trackCatalog';
import type { PlaybackState, TranscriptLine } from './types';
import type { PlannedTrack } from '@auracle/shared';

const HISTORY_LIMIT = 12;
const STORAGE_PREFIX = 'auracle:session-history:';

export interface SessionHistoryTrack extends PlannedTrack {
  title: string;
  artist: string;
}

export interface SessionHistoryEntry {
  id: string;
  userId: string;
  title: string;
  subtitle: string;
  savedAt: number;
  durationSec: number;
  currentTrackIndex: number;
  trackCount: number;
  tracks: SessionHistoryTrack[];
  transcript: TranscriptLine[];
  playlistFeedback: PlaybackState['playlistFeedback'];
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function canSaveSession(state: PlaybackState): state is PlaybackState & { sessionId: string } {
  return Boolean(state.sessionId && state.sessionTracklist.length > 0 && state.sessionElapsedSec > 0);
}

export function createSessionHistoryEntry(state: PlaybackState, userId: string): SessionHistoryEntry | undefined {
  if (!canSaveSession(state)) return undefined;
  return {
    id: state.sessionId,
    userId,
    title: state.sessionTitle,
    subtitle: state.sessionSubtitle,
    savedAt: Date.now(),
    durationSec: state.sessionElapsedSec,
    currentTrackIndex: state.currentTrackIndex,
    trackCount: state.sessionTracklist.length,
    tracks: state.sessionTracklist.map((track) => {
      const meta = getTrackMeta(track.id);
      return {
        ...track,
        title: meta.title,
        artist: meta.artist,
      };
    }),
    transcript: state.transcript.slice(-8),
    playlistFeedback: state.playlistFeedback,
  };
}

export function loadSessionHistory(userId: string): SessionHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHistoryEntry) : [];
  } catch {
    return [];
  }
}

export function saveSessionHistoryEntry(entry: SessionHistoryEntry): SessionHistoryEntry[] {
  if (typeof window === 'undefined') return [entry];
  const next = [
    entry,
    ...loadSessionHistory(entry.userId).filter((existing) => existing.id !== entry.id),
  ].slice(0, HISTORY_LIMIT);
  window.localStorage.setItem(storageKey(entry.userId), JSON.stringify(next));
  return next;
}

function isHistoryEntry(value: unknown): value is SessionHistoryEntry {
  const entry = value as Partial<SessionHistoryEntry>;
  return Boolean(
    entry &&
      typeof entry.id === 'string' &&
      typeof entry.userId === 'string' &&
      typeof entry.title === 'string' &&
      typeof entry.savedAt === 'number' &&
      Array.isArray(entry.tracks),
  );
}
