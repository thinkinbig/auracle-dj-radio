import type { HostMode } from '@auracle/shared';

export type UiPhase = 'idle' | 'curating' | 'opening' | 'playing' | 'speaking' | 'listening' | 'paused';

export interface TranscriptLine {
  id: string;
  role: 'user' | 'model';
  text: string;
  elapsedSec: number;
}

export interface PlaybackState {
  phase: UiPhase;
  sessionId: string | null;
  hostMode: HostMode;
  /** Non-null when the app is running in local demo fallback (no backend Live session). */
  liveWarning: string | null;
  sessionTitle: string;
  sessionSubtitle: string;
  trackId: string;
  trackTitle: string;
  artist: string;
  albumTitle: string;
  albumCoverUrl: string;
  artistPhotoUrl: string;
  lore: string;
  durationSec: number;
  progressSec: number;
  sessionElapsedSec: number;
  transcript: TranscriptLine[];
  activeTranscriptId: string | null;
  remainingTrackIds: string[];
  currentTrackIndex: number;
  liveWsUrl: string | null;
}
