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
 * Spotify Web Playback backend. Music plays on Spotify's own device (outside the
 * WebAudio bus), so progress/ended are *polled* and reconciled to the normalized
 * callbacks, and ducking is a coarse device `setVolume` (ADR-0005 §6). The poll
 * runs only while this player is active — `pause()` stops it, `load()/resume()`
 * (re)start it — so it stays idle during local stretches.
 */
export function createSpotifyPlayer(cb: MusicPlayerCallbacks): MusicPlayer {
  let timer: number | null = null;
  // The uri the server chose for the current slot; started lazily so the opening
  // gate can hold track 0 until released (load autostart:false → resume starts it).
  let pendingUri: string | null = null;
  let started = false;
  let endedFired = false;

  const stopPoll = (): void => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  const startPoll = (): void => {
    if (timer !== null) return;
    timer = window.setInterval(() => {
      void getSpotifyPlaybackSnapshot().then((snap) => {
        if (!snap) return;
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
    void playSpotifyUri(pendingUri);
  };

  return {
    load(track, { autostart }) {
      pendingUri = track.spotify?.uri ?? null;
      started = false;
      endedFired = false;
      startPoll();
      if (autostart) start();
    },
    preload() {
      // No client-side prefetch: the device resolves the uri on play. Keeping the
      // player warm (SDK connected) is what avoids spin-up; handled at connect.
    },
    pause() {
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
      stopPoll();
      void pauseSpotifyPlayback();
    },
  };
}
