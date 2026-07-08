import type { UiPhase } from '../session/types.js';

/** Fallback if Live never returns dj_turn_end for the opening. */
export const OPENING_GATE_TIMEOUT_MS = 20_000;

export const MUSIC_VOLUME = {
  silent: 0,
  duck: 0.25,
  full: 1,
} as const;

/** End-of-track talk break tuning (ADR-0004). Numbers are tunable during testing. */
export const TALK_WINDOW = {
  /** DJ starts the break this many seconds before the track ends (talk-over). */
  leadSec: 10,
  /** Silence timeout for the first listening window. */
  openMs: 5_000,
  /** Silence timeout for follow-up windows after a DJ reply. */
  followMs: 3_000,
  /** Hard cap on total break duration — force-advance past this. */
  hardCapMs: 30_000,
  /** Force-advance after this many user turns in one break. */
  maxUserTurns: 3,
} as const;

export interface PlaybackPolicyInput {
  phase: UiPhase;
  currentTrackIndex: number;
  openingReleased: boolean;
}

/** Opening track 0: music preloads but stays silent until openingReleased. */
export function isOpeningBlocked(input: PlaybackPolicyInput): boolean {
  return input.currentTrackIndex === 0 && !input.openingReleased;
}

/** Music gain for talk-over duck vs opening silence vs full playback. */
export function musicVolume(input: PlaybackPolicyInput): number {
  if (isOpeningBlocked(input)) return MUSIC_VOLUME.silent;
  if (input.phase === 'speaking' || input.phase === 'listening') return MUSIC_VOLUME.duck;
  return MUSIC_VOLUME.full;
}

export function shouldPlayMusic(input: PlaybackPolicyInput): boolean {
  if (input.phase === 'paused' || input.phase === 'idle' || input.phase === 'curating') return false;
  if (isOpeningBlocked(input)) return false;
  return (
    input.phase === 'opening' ||
    input.phase === 'playing' ||
    input.phase === 'speaking' ||
    input.phase === 'listening'
  );
}

export function isSessionClockRunning(phase: UiPhase): boolean {
  return (
    phase === 'playing' ||
    phase === 'speaking' ||
    phase === 'listening' ||
    phase === 'opening'
  );
}
