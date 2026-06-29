import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useCatalogLoaded, useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { useLayoutMode } from '@/shared/hooks/useMediaQuery';
import { formatTime } from '@/shared/lib/formatTime';
import {
  canSkipTrack,
  isCurating,
  isIdle,
  isPaused,
  isSessionComplete,
  playbackProgressPct,
  selectQueueRefresh,
} from '@/features/radio/session/playbackSelectors';
import { IconMic, IconPause, IconPlay, IconSkipNext } from '@/shared/ui/Icons';
import { IntentOnboarding } from './IntentOnboarding';
import { SessionSummary } from './SessionSummary';
import { Skeleton } from '@/shared/ui/Skeleton';
import { cn } from '@/shared/lib/cn';
import styles from './ContentSheet.module.css';

export function ContentSheet() {
  const state = useRadioState();
  const { handleStart, handleTogglePause, handleSkipTrack, handleContinue, handleTalkStart, handleTalkEnd, handleRetryExtend, handleReturnToSetup } = useRadioActions();
  const { isWide } = useLayoutMode();
  const paused = isPaused(state.phase);
  const idle = isIdle(state.phase);
  const complete = isSessionComplete(state.phase);
  const curating = isCurating(state.phase);
  const catalogLoaded = useCatalogLoaded();
  const track = useTrackMeta(state.trackId);
  const showSkeleton = curating || (idle && !catalogLoaded);
  const showOnboarding = idle;
  const skipDisabled = !canSkipTrack(state);
  const refresh = selectQueueRefresh(state);
  const extendPending = complete && refresh.pending;
  const extendFailed = complete && refresh.failed;
  const pct = playbackProgressPct(state);
  const currentCoverUrl = state.albumCoverUrl || track.albumCoverUrl;
  const flowLabel = state.sessionSubtitle
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
  const queuedLabel = `${state.remainingTrackIds.length} in queue`;

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
            <div className={styles.nowPlaying}>
              <p className={styles.trackKicker}>Now playing</p>
              <div className={styles.nowPlayingBody}>
                {currentCoverUrl ? (
                  <img
                    className={styles.cover}
                    src={currentCoverUrl}
                    alt=""
                    width={96}
                    height={96}
                    loading="lazy"
                  />
                ) : null}
                <div className={styles.trackInfo}>
                  <p className={styles.trackTitle}>{state.trackTitle}</p>
                  <div className={styles.albumLine}>
                    <p className={styles.trackCredit}>
                      <span>{state.artist}</span>
                      {state.albumTitle ? <small>{state.albumTitle}</small> : null}
                    </p>
                    {track.mood ? <p className={styles.trackMood}>{track.mood}</p> : null}
                  </div>
                </div>
              </div>
              <div className={styles.sessionFlow}>
                <div>
                  <p className={styles.flowKicker}>Session flow</p>
                  <p className={styles.flowText}>{flowLabel || 'Flow adjusting live'}</p>
                </div>
                <p className={styles.queueCount}>{queuedLabel}</p>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles.controls}>
        {complete ? (
          <div className={styles.completePanel} role="status" aria-live="polite">
            {extendPending ? (
              <p className={styles.completeCopy}>Finding more music for your station…</p>
            ) : (
              <>
                <p className={styles.completeTitle}>Session complete</p>
                <p className={styles.completeCopy}>
                  {extendFailed
                    ? 'We could not fetch the next batch. You can try again or start a fresh session.'
                    : 'This set has played through. Keep listening or start something new.'}
                </p>
                <div className={styles.completeActions}>
                  {extendFailed ? (
                    <button type="button" className={styles.continueBtn} onClick={handleRetryExtend}>
                      Continue listening
                    </button>
                  ) : null}
                  <button type="button" className={styles.completeSecondaryBtn} onClick={handleReturnToSetup}>
                    New session
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {showOnboarding ? (
        <IntentOnboarding onStart={(intent) => void handleStart(intent)} disabled={curating} />
      ) : null}

      {complete ? <SessionSummary /> : null}
    </section>
  );
}
