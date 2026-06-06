export type UiPhase = 'idle' | 'playing' | 'speaking' | 'listening' | 'paused';

export interface TranscriptLine {
  id: string;
  role: 'user' | 'model';
  text: string;
  elapsedSec: number;
}

export interface PlaybackState {
  phase: UiPhase;
  sessionTitle: string;
  sessionSubtitle: string;
  trackId: string;
  trackTitle: string;
  artist: string;
  durationSec: number;
  progressSec: number;
  sessionElapsedSec: number;
  transcript: TranscriptLine[];
  activeTranscriptId: string | null;
  remainingTrackIds: string[];
  currentTrackIndex: number;
  liveWsUrl: string | null;
}
