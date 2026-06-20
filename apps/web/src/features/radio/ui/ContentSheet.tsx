import { useEffect, useState } from 'react';
import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useCatalogLoaded } from '@/shared/hooks/useTrackCatalog';
import { useLayoutMode } from '@/shared/hooks/useMediaQuery';
import { formatTime } from '@/shared/lib/formatTime';
import { DJ_NAME } from '@/shared/lib/constants';
import {
  canSkipTrack,
  isCurating,
  isIdle,
  isPaused,
  playbackProgressPct,
} from '@/features/radio/session/playbackSelectors';
import { IconMic, IconPause, IconPlay, IconSkipNext } from '@/shared/ui/Icons';
import { IntentOnboarding } from './IntentOnboarding';
import { Skeleton } from '@/shared/ui/Skeleton';
import { TranscriptPanel } from './TranscriptPanel';
import { cn } from '@/shared/lib/cn';
import styles from './ContentSheet.module.css';

export function ContentSheet() {
  const state = useRadioState();
  const { handleStart, handleTogglePause, handleSkipTrack, handleContinue, handleTalkStart, handleTalkEnd } = useRadioActions();
  const { isWide } = useLayoutMode();
  const paused = isPaused(state.phase);
  const idle = isIdle(state.phase);
  const curating = isCurating(state.phase);
  const catalogLoaded = useCatalogLoaded();
  const showSkeleton = curating || (idle && !catalogLoaded);
  const showOnboarding = idle;
  const showTranscript = !showOnboarding;
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
      <div
        className={cn(styles.header, showOnboarding && styles.headerCompact)}
        aria-busy={showSkeleton || undefined}
      >
        {showSkeleton ? (
          <>
            <Skeleton variant="text" height={28} width="72%" className={styles.skeletonTitle} />
            <Skeleton variant="text" height={14} width="42%" className={styles.skeletonMeta} />
            <div className={styles.nowPlaying}>
              <Skeleton variant="rect" width={88} height={88} className={styles.cover} />
              <div className={styles.trackInfo}>
                <Skeleton variant="text" height={20} width="68%" />
                <div className={styles.trackCredit}>
                  <Skeleton variant="circle" width={32} height={32} />
                  <Skeleton variant="text" height={14} width="55%" className={styles.skeletonCredit} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className={styles.title}>{state.sessionTitle}</h1>
            <p className={styles.meta} data-session-heading>{state.sessionSubtitle}</p>
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
          </>
        )}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={idle ? undefined : handleTogglePause}
          disabled={curating || idle}
          aria-label={idle ? 'Start from onboarding below' : paused ? 'Resume' : 'Pause'}
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

        {!idle && !curating && !state.inBreak && (
          <button
            type="button"
            className={cn(styles.talkBtn, state.isTalking && styles.talkBtnActive)}
            onPointerDown={handleTalkStart}
            onPointerUp={handleTalkEnd}
            onPointerLeave={handleTalkEnd}
            aria-label="Hold to talk to DJ"
            aria-pressed={state.isTalking}
          >
            <IconMic size={18} />
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

      {showOnboarding ? (
        <IntentOnboarding onStart={(intent) => void handleStart(intent)} disabled={curating} />
      ) : showTranscript ? (
        <TranscriptPanel djName={DJ_NAME} />
      ) : null}
    </section>
  );
}
