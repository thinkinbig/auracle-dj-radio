import type { SpotifyTrackRef, TrackSource } from '@auracle/shared';

/**
 * A track the player can load, narrowed to what playback needs. `source` selects
 * the backend; `spotify` carries the inline metadata a Spotify slot needs (no
 * catalog entry to resolve by `id`). See ADR-0005.
 */
export interface PlayableTrack {
  id: string;
  source: TrackSource;
  spotify?: SpotifyTrackRef;
}

/** Normalized playback events — each backend reconciles its own model (events vs polling) to these. */
export interface MusicPlayerCallbacks {
  /** Fires as playback advances; both values in seconds (may be fractional). */
  onProgress: (currentSec: number, durationSec: number) => void;
  onDuration: (durationSec: number) => void;
  onEnded: () => void;
}

/**
 * The music source for one playback backend. DJ voice is orthogonal — it always
 * flows through the WebAudio bus — so this abstracts the *music* only (ADR-0005 §6).
 * `useTrackPlayback` holds one implementation per source and delegates by
 * `track.source`; coordination (talk window, advance, duck policy) stays in the hook.
 */
export interface MusicPlayer {
  /** Load `track` and start it unless `autostart` is false (opening gate holds track 0). */
  load(track: PlayableTrack, opts: { autostart: boolean }): void;
  /** Prefetch the upcoming track's media; `null` clears any prefetch. */
  preload(track: PlayableTrack | null): void;
  pause(): void;
  resume(): void;
  /** Apply the duck/talk-over volume. `rampSec` omitted ⇒ backend default fade. */
  setMusicVolume(volume: number, rampSec?: number): void;
  dispose(): void;
}
