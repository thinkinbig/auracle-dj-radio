import type { AudioRefs } from '../effects/sessionRefs';
import type { MusicPlayer, MusicPlayerCallbacks } from './MusicPlayer';

/**
 * Local catalog playback over the shared `<audio>` element (wired into the
 * WebAudio bus at `handleStart`). Volume rides the bus music-gain so the DJ
 * talk-over duck is sample-accurate; the `<audio>` events map straight onto the
 * normalized callbacks. ADR-0005 §6.
 */
export function createLocalPlayer(audio: AudioRefs, cb: MusicPlayerCallbacks): MusicPlayer {
  const el = audio.audioRef.current ?? (audio.audioRef.current = new Audio());
  let preloadEl: HTMLAudioElement | null = null;

  const onTime = (): void => cb.onProgress(el.currentTime, el.duration);
  const onMeta = (): void => cb.onDuration(el.duration);
  const onEnded = (): void => cb.onEnded();
  el.addEventListener('timeupdate', onTime);
  el.addEventListener('loadedmetadata', onMeta);
  el.addEventListener('ended', onEnded);

  return {
    load(track, { autostart }) {
      el.preload = 'auto';
      el.src = `/tracks/${track.id}/audio`;
      el.load();
      el.pause();
      el.currentTime = 0;
      if (autostart) void el.play().catch(() => {});
    },
    preload(track) {
      if (!track) return;
      const pre = preloadEl ?? (preloadEl = new Audio());
      pre.preload = 'auto';
      pre.src = `/tracks/${track.id}/audio`;
    },
    pause() {
      el.pause();
    },
    resume() {
      void el.play().catch(() => {});
    },
    setMusicVolume(volume, rampSec) {
      audio.audioBusRef.current?.setMusicVolume(volume, rampSec);
    },
    dispose() {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnded);
      el.pause();
    },
  };
}
