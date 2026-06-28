import type { FlowTrackRef, HostMode } from '@auracle/shared';

export type UiPhase = 'idle' | 'curating' | 'opening' | 'playing' | 'speaking' | 'listening' | 'paused';
export type PlaylistFeedback = 'like' | 'dislike' | 'regenerate';
export type QueueRefreshStatus = 'idle' | 'pending' | 'complete' | 'error';

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
  sessionTracklist: FlowTrackRef[];
  remainingTrackIds: string[];
  currentTrackIndex: number;
  /** Proxy base URL + token for the browser↔proxy WebRTC session (null in demo fallback). */
  proxyUrl: string | null;
  token: string | null;
  /** True during an end-of-track talk break (DJ wrap + listening window) — ADR-0004. */
  inBreak: boolean;
  /** True while the user is holding the Talk button (push-to-talk). */
  isTalking: boolean;
  /** Count of distinct user utterances; drives the talk-window silence/turn cap. */
  userUtteranceCount: number;
  /** Last explicit playlist feedback action from the listener. */
  playlistFeedback: PlaylistFeedback | null;
  /** Status for the explicit regenerate path. */
  queueRefreshStatus: QueueRefreshStatus;
  /** Remaining-track ids briefly highlighted after a queue diff lands. */
  recentlyChangedIds: string[];
  /** Session-clock second when the current queue diff highlight should clear. */
  queueDiffExpiresAtSec: number | null;
  /** Brief queue diff copy shown while the highlight is active. */
  queueDiffMessage: string | null;
}
