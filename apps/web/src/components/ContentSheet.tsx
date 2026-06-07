import { useEffect, useState } from 'react';
import { useRadioActions, useRadioState } from '../context/RadioSessionContext';
import { useLayoutMode } from '../hooks/useMediaQuery';
import { formatTime } from '../lib/formatTime';
import { DJ_NAME } from '../lib/constants';
import {
  canSkipTrack,
  isCurating,
  isIdle,
  isPaused,
  playbackProgressPct,
} from '../lib/playbackSelectors';
import { IconMic, IconPause, IconPlay, IconSkipNext } from './Icons';
import { TranscriptPanel } from './TranscriptPanel';
import { cn } from '../lib/cn';
import styles from './ContentSheet.module.css';

export function ContentSheet() {
  const state = useRadioState();
  const { handleStart, handleTogglePause, handleSkipTrack, handleContinue } = useRadioActions();
  const { isWide } = useLayoutMode();
  const paused = isPaused(state.phase);
  const idle = isIdle(state.phase);
  const curating = isCurating(state.phase);
  const showMobileStart = idle && !isWide;
  const showTranscript = !showMobileStart && !(idle && isWide);
  const skipDisabled = !canSkipTrack(state);
  const pct = playbackProgressPct(state);
  const creditLine = state.albumTitle ? `${state.artist} · ${state.albumTitle}` : state.artist;
  const [artistPhotoFailed, setArtistPhotoFailed] = useState(false);
  const showArtistPhoto = Boolean(state.artistPhotoUrl) && !artistPhotoFailed;
  const artistInitial = state.artist.trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    setArtistPhotoFailed(false);
  }, [state.artistPhotoUrl]);

  return (
    <section className={styles.root} aria-label="Now playing">
      <div className={cn(styles.header, showMobileStart && styles.headerCompact)}>
        <h1 className={styles.title}>{state.sessionTitle}</h1>
        <p className={styles.meta}>{state.sessionSubtitle}</p>
        <div className={styles.nowPlaying}>
          {state.albumCoverUrl ? (
            <img
              className={styles.cover}
              src={state.albumCoverUrl}
              alt=""
              width={88}
              height={88}
              loading="lazy"
            />
          ) : null}
          <div className={styles.trackInfo}>
            <p className={styles.trackTitle}>{state.trackTitle}</p>
            <p className={styles.trackCredit}>
              {showArtistPhoto ? (
                <img
                  className={styles.artistPhoto}
                  src={state.artistPhotoUrl}
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
            {state.lore && !idle ? (
              <div className={styles.loreScroll}>
                <p className={styles.lore}>{state.lore}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={idle ? () => void handleStart() : handleTogglePause}
          disabled={curating}
          aria-label={idle || paused ? 'Start session' : 'Pause'}
        >
          {idle || paused ? <IconPlay size={18} /> : <IconPause size={18} />}
        </button>

        {state.inBreak ? (
          <button
            type="button"
            className={styles.continueBtn}
            onClick={handleContinue}
            aria-label="Continue to next track"
          >
            {state.phase === 'listening' ? <IconMic size={15} /> : null}
            Continue
          </button>
        ) : (
          <button
            type="button"
            className={styles.skipBtn}
            onClick={handleSkipTrack}
            disabled={skipDisabled}
            aria-label="Next track"
          >
            <IconSkipNext size={18} />
          </button>
        )}

        <div className={styles.progress}>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.progressTimes}>
            <span>{formatTime(state.progressSec)}</span>
            <span>{formatTime(state.durationSec)}</span>
          </div>
        </div>
      </div>

      {showMobileStart ? (
        <div className={styles.startZone}>
          <button
            type="button"
            className={styles.startBtn}
            onClick={() => void handleStart()}
            aria-label="Tap to start session"
          >
            <span className={styles.startIcon}>
              <IconPlay size={28} />
            </span>
            <span className={styles.startLabel}>Tap to start</span>
          </button>
        </div>
      ) : showTranscript ? (
        <TranscriptPanel djName={DJ_NAME} />
      ) : null}
    </section>
  );
}
