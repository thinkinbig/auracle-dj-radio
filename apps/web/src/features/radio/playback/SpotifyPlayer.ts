import {
  getSpotifyPlaybackSnapshot,
  pauseSpotifyPlayback,
  playSpotifyUri,
  resumeSpotifyPlayback,
  setSpotifyVolume,
} from '@/features/spotify/spotifyPlayback';
import type { MusicPlayer, MusicPlayerCallbacks } from './MusicPlayer';

const POLL_MS = 1000;

/**
 * How long a freshly-started Spotify track has to actually begin playing on the
 * device before we treat it as a transient failure (device dropped, stale uri,
 * network) and skip forward (#76, ADR-0005 §9). The device normally reports our
 * uri within one poll, so this is comfortably past a healthy start without
 * leaving dead air. The gather-time `is_playable` filter (#73) already removed
 * market-unplayable tracks; this only catches the residual runtime failures.
 */
const START_TIMEOUT_MS = 5000;

/**
 * Spotify Web Playback backend. Music plays on Spotify's own device (outside the
 * WebAudio bus), so progress/ended are *polled* and reconciled to the normalized
 * callbacks, and ducking is a coarse device `setVolume` (ADR-0005 §6). The poll
 * runs only while this player is active — `pause()` stops it, `load()/resume()`
 * (re)start it — so it stays idle during local stretches.
 */
export function createSpotifyPlayer(cb: MusicPlayerCallbacks): MusicPlayer {
  let timer: number | null = null;
  let watchdog: number | null = null;
  // The uri the server chose for the current slot; started lazily so the opening
  // gate can hold track 0 until released (load autostart:false → resume starts it).
  let pendingUri: string | null = null;
  let started = false;
  let endedFired = false;
  // Set once the device reports our uri playing, so a confirmed start can't be
  // skip-forwarded by a late-firing watchdog.
  let confirmedStarted = false;

  const stopPoll = (): void => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const clearWatchdog = (): void => {
    if (watchdog !== null) {
      window.clearTimeout(watchdog);
      watchdog = null;
    }
  };

  /**
   * Skip-forward when a started track never produced audio (#76). Reuses
   * `onEnded` — the player's existing advance signal — so the talk-window/replan
   * path stays identical to a natural track end. Fires at most once per track.
   */
  const failStart = (): void => {
    clearWatchdog();
    if (endedFired) return;
    endedFired = true;
    cb.onEnded();
  };

  const startPoll = (): void => {
    if (timer !== null) return;
    timer = window.setInterval(() => {
      void getSpotifyPlaybackSnapshot().then((snap) => {
        if (!snap) return;
        // The device is now playing our uri — the start succeeded; stand the
        // watchdog down so it can't skip a healthy track.
        if (!confirmedStarted && snap.uri === pendingUri) {
          confirmedStarted = true;
          clearWatchdog();
        }
        const progressSec = snap.progressMs / 1000;
        const durationSec = snap.durationMs / 1000;
        cb.onDuration(durationSec);
        cb.onProgress(progressSec, durationSec);
        // The device has no 'ended' event — synthesize one as the tail approaches,
        // once per loaded track.
        if (!endedFired && !snap.paused && durationSec > 0 && progressSec >= durationSec - 1) {
          endedFired = true;
          cb.onEnded();
        }
      });
    }, POLL_MS);
  };

  const start = (): void => {
    if (!pendingUri) return;
    started = true;
    endedFired = false;
    confirmedStarted = false;
    clearWatchdog();
    watchdog = window.setTimeout(failStart, START_TIMEOUT_MS);
    void playSpotifyUri(pendingUri).then((ok) => {
      // A rejected play request (stale uri, device not ready) fails fast — no need
      // to wait out the watchdog.
      if (!ok) failStart();
    });
  };

  return {
    load(track, { autostart }) {
      clearWatchdog();
      pendingUri = track.spotify?.uri ?? null;
      started = false;
      endedFired = false;
      confirmedStarted = false;
      startPoll();
      if (autostart) start();
    },
    preload() {
      // No client-side prefetch: the device resolves the uri on play. Keeping the
      // player warm (SDK connected) is what avoids spin-up; handled at connect.
    },
    pause() {
      clearWatchdog();
      stopPoll();
      void pauseSpotifyPlayback();
    },
    resume() {
      startPoll();
      // First resume after a held opening starts playback; later ones resume it.
      if (pendingUri && !started) start();
      else void resumeSpotifyPlayback();
    },
    setMusicVolume(volume) {
      void setSpotifyVolume(volume);
    },
    dispose() {
      clearWatchdog();
      stopPoll();
      void pauseSpotifyPlayback();
    },
  };
}
