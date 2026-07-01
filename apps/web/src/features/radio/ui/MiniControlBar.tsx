import { useRef } from 'react';
import type { CSSProperties } from 'react';
import type { HostMode } from '@auracle/shared';
import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useBarCount } from '@/shared/hooks/useBarCount';
import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
import { cn } from '@/shared/lib/cn';
import {
  canSkipTrack,
  hostModeDisabled,
  isCurating,
  isIdle,
  isPaused,
  playbackProgressPct,
} from '@/features/radio/session/playbackSelectors';
import {
  IconPause,
  IconPlay,
  IconRepeat,
  IconShuffle,
  IconSkipNext,
  IconSkipPrevious,
} from '@/shared/ui/icons';
import styles from './MiniControlBar.module.css';

const HOST_MODE_OPTIONS: Array<{ value: HostMode; label: string }> = [
  { value: 'curator', label: 'Guide' },
  { value: 'set_dj', label: 'Quiet' },
  { value: 'hype', label: 'Energy' },
];

export function MiniControlBar() {
  const state = useRadioState();
  const track = useTrackMeta(state.trackId);
  const {
    handleTogglePause,
    handleSkipTrack,
    handleContinue,
    handleChangeHostMode,
  } = useRadioActions();
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(waveRef, 5, 32, 160);
  const paused = isPaused(state.phase);
  const idle = isIdle(state.phase);
  const curating = isCurating(state.phase);
  const skipDisabled = !canSkipTrack(state);
  const modeDisabled = hostModeDisabled(state);
  const pct = playbackProgressPct(state);
  const currentCoverUrl = state.albumCoverUrl || track.albumCoverUrl;

  return (
    <footer className={styles.root} aria-label="Playback controls">
      <div className={styles.trackCard}>
        {currentCoverUrl ? (
          <img className={styles.cover} src={currentCoverUrl} alt="" width={52} height={52} loading="lazy" />
        ) : null}
        <div className={styles.trackCopy}>
          <p>{state.trackTitle}</p>
          <span>{state.artist}</span>
        </div>
      </div>

      <div className={styles.timeline}>
        <time className={styles.time}>{formatTime(state.progressSec)}</time>
        <div
          ref={waveRef}
          className={styles.wave}
          style={{ '--bar-count': barCount } as CSSProperties}
          aria-hidden
        >
          {Array.from({ length: barCount }, (_, i) => {
            const threshold = (i / barCount) * 100;
            const active = threshold <= pct;
            return <span key={i} className={cn(styles.bar, active && styles.barActive)} />;
          })}
        </div>
        <time className={styles.timeEnd}>{formatTime(state.durationSec)}</time>
      </div>

      <div className={styles.transport} aria-label="Track transport">
        <button type="button" className={styles.btnGhost} disabled aria-label="Shuffle unavailable">
          <IconShuffle size={16} />
        </button>
        <button type="button" className={styles.btnGhost} disabled aria-label="Previous track unavailable">
          <IconSkipPrevious size={18} />
        </button>
        <button
          type="button"
          className={styles.playBtn}
          onClick={idle ? undefined : handleTogglePause}
          disabled={curating || idle}
          aria-label={idle ? 'Start from onboarding' : paused ? 'Resume' : 'Pause'}
        >
          {idle || paused ? <IconPlay size={20} /> : <IconPause size={20} />}
        </button>

        {state.inBreak ? (
          <button
            type="button"
            className={styles.continueBtn}
            onClick={handleContinue}
            aria-label="Continue to next track"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className={styles.btnGhost}
            onClick={handleSkipTrack}
            disabled={skipDisabled}
            aria-label="Next track"
          >
            <IconSkipNext size={18} />
          </button>
        )}
        <button type="button" className={styles.btnGhost} disabled aria-label="Repeat unavailable">
          <IconRepeat size={16} />
        </button>
      </div>

      <div className={styles.rightControls}>
        {!idle && (
          <div className={styles.hostModes} aria-label="Host mode">
            {HOST_MODE_OPTIONS.map((option) => {
              const active = state.hostMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(styles.hostMode, active && styles.hostModeActive)}
                  onClick={() => handleChangeHostMode(option.value)}
                  disabled={modeDisabled}
                  aria-pressed={active}
                  aria-label={`Switch host mode to ${option.label}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </footer>
  );
}
