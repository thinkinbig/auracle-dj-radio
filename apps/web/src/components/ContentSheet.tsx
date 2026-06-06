import { useEffect, useState } from 'react';
import { useLayoutMode } from '../hooks/useMediaQuery';
import { formatTime } from '../lib/formatTime';
import type { TranscriptLine, UiPhase } from '../types';
import { IconPause, IconPlay, IconSkipNext } from './Icons';
import { TranscriptPanel } from './TranscriptPanel';
import { cn } from '../lib/cn';
import styles from './ContentSheet.module.css';

interface ContentSheetProps {
  phase: UiPhase;
  sessionTitle: string;
  sessionSubtitle: string;
  trackTitle: string;
  artist: string;
  albumTitle: string;
  albumCoverUrl: string;
  artistPhotoUrl: string;
  lore: string;
  progressSec: number;
  durationSec: number;
  transcript: TranscriptLine[];
  activeTranscriptId: string | null;
  djName: string;
  onTogglePause: () => void;
  onSkipTrack: () => void;
  hasNextTrack: boolean;
  onStart: () => void;
}

export function ContentSheet({
  phase,
  sessionTitle,
  sessionSubtitle,
  trackTitle,
  artist,
  albumTitle,
  albumCoverUrl,
  artistPhotoUrl,
  lore,
  progressSec,
  durationSec,
  transcript,
  activeTranscriptId,
  djName,
  onTogglePause,
  onSkipTrack,
  hasNextTrack,
  onStart,
}: ContentSheetProps) {
  const { isWide } = useLayoutMode();
  const isPaused = phase === 'paused';
  const isIdle = phase === 'idle';
  const isCurating = phase === 'curating';
  const showMobileStart = isIdle && !isWide;
  const skipDisabled = isIdle || isCurating || !hasNextTrack;
  const pct = durationSec > 0 ? Math.min(100, (progressSec / durationSec) * 100) : 0;
  const creditLine = albumTitle ? `${artist} · ${albumTitle}` : artist;
  const [artistPhotoFailed, setArtistPhotoFailed] = useState(false);
  const showArtistPhoto = Boolean(artistPhotoUrl) && !artistPhotoFailed;
  const artistInitial = artist.trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    setArtistPhotoFailed(false);
  }, [artistPhotoUrl]);

  return (
    <section className={styles.root} aria-label="Now playing">
      <div className={cn(styles.header, showMobileStart && styles.headerCompact)}>
        <h1 className={styles.title}>{sessionTitle}</h1>
        <p className={styles.meta}>{sessionSubtitle}</p>
        <div className={styles.nowPlaying}>
          {albumCoverUrl ? (
            <img
              className={styles.cover}
              src={albumCoverUrl}
              alt=""
              width={88}
              height={88}
              loading="lazy"
            />
          ) : null}
          <div className={styles.trackInfo}>
            <p className={styles.trackTitle}>{trackTitle}</p>
            <p className={styles.trackCredit}>
              {showArtistPhoto ? (
                <img
                  className={styles.artistPhoto}
                  src={artistPhotoUrl}
                  alt=""
                  width={32}
                  height={32}
                  loading="lazy"
                  onError={() => setArtistPhotoFailed(true)}
                />
              ) : (
                <span className={styles.artistInitial} aria-hidden>
                  {artistInitial}
                </span>
              )}
              <span className={styles.creditText}>{creditLine}</span>
            </p>
            {lore && !isIdle ? <p className={styles.lore}>{lore}</p> : null}
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={isIdle ? onStart : onTogglePause}
          disabled={isCurating}
          aria-label={isIdle || isPaused ? 'Start session' : 'Pause'}
        >
          {isIdle || isPaused ? <IconPlay size={18} /> : <IconPause size={18} />}
        </button>

        <button
          type="button"
          className={styles.skipBtn}
          onClick={onSkipTrack}
          disabled={skipDisabled}
          aria-label="Next track"
        >
          <IconSkipNext size={18} />
        </button>

        <div className={styles.progress}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.progressTimes}>
            <span>{formatTime(progressSec)}</span>
            <span>{formatTime(durationSec)}</span>
          </div>
        </div>
      </div>

      {showMobileStart ? (
        <div className={styles.startZone}>
          <button
            type="button"
            className={styles.startBtn}
            onClick={onStart}
            aria-label="Tap to start session"
          >
            <span className={styles.startIcon}>
              <IconPlay size={28} />
            </span>
            <span className={styles.startLabel}>Tap to start</span>
          </button>
        </div>
      ) : (
        <TranscriptPanel
          phase={phase}
          lines={transcript}
          activeId={activeTranscriptId}
          djName={djName}
          onStart={onStart}
        />
      )}
    </section>
  );
}
