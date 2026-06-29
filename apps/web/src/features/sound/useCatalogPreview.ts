import { useCallback, useEffect, useRef, useState } from 'react';

/** Local preview playback for catalog browse (single track, no DJ session). */
export function useCatalogPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const audio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }, []);

  const toggle = useCallback(
    (trackId: string) => {
      const el = audio();
      if (activeId === trackId) {
        if (el.paused) {
          void el.play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        } else {
          el.pause();
          setIsPlaying(false);
        }
        return;
      }

      el.src = `/tracks/${trackId}/audio`;
      setActiveId(trackId);
      void el.play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setActiveId(null);
          setIsPlaying(false);
        });
    },
    [activeId, audio],
  );

  useEffect(() => {
    const el = audio();
    const onEnded = () => {
      setActiveId(null);
      setIsPlaying(false);
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    el.addEventListener('ended', onEnded);
    el.addEventListener('pause', onPause);
    el.addEventListener('play', onPlay);
    return () => {
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('play', onPlay);
      el.pause();
    };
  }, [audio]);

  const isTrackPlaying = useCallback(
    (trackId: string) => activeId === trackId && isPlaying,
    [activeId, isPlaying],
  );

  const isTrackActive = useCallback((trackId: string) => activeId === trackId, [activeId]);

  return { toggle, isTrackPlaying, isTrackActive, activeId, isPlaying };
}
