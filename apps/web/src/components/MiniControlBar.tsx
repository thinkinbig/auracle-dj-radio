import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useBarCount } from '../hooks/useBarCount';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import type { UiPhase } from '../types';
import { IconPause, IconPlay, IconSkipNext } from './Icons';
import styles from './MiniControlBar.module.css';

interface MiniControlBarProps {
  phase: UiPhase;
  progressSec: number;
  durationSec: number;
  hasNextTrack: boolean;
  onTogglePause: () => void;
  onSkipTrack: () => void;
}

export function MiniControlBar({
  phase,
  progressSec,
  durationSec,
  hasNextTrack,
  onTogglePause,
  onSkipTrack,
}: MiniControlBarProps) {
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(waveRef, 5, 32, 160);
  const isPaused = phase === 'paused';
  const notReady = phase === 'idle' || phase === 'curating';
  const skipDisabled = notReady || !hasNextTrack;
  const pct = durationSec > 0 ? Math.min(100, (progressSec / durationSec) * 100) : 0;

  return (
    <footer className={styles.root} aria-label="Playback controls">
      <time className={styles.time}>{formatTime(progressSec)}</time>

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

      <time className={styles.timeEnd}>{formatTime(durationSec)}</time>

      <button
        type="button"
        className={styles.btn}
        onClick={onSkipTrack}
        disabled={skipDisabled}
        aria-label="Next track"
      >
        <IconSkipNext size={16} />
      </button>

      <button
        type="button"
        className={styles.btn}
        onClick={onTogglePause}
        disabled={notReady}
        aria-label={isPaused || notReady ? 'Play' : 'Pause'}
      >
        {isPaused || notReady ? <IconPlay size={16} /> : <IconPause size={16} />}
      </button>
    </footer>
  );
}
