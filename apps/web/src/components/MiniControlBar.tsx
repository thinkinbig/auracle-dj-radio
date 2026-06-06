import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useBarCount } from '../hooks/useBarCount';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import type { UiPhase } from '../types';
import { IconPause, IconPlay } from './Icons';
import styles from './MiniControlBar.module.css';

interface MiniControlBarProps {
  phase: UiPhase;
  progressSec: number;
  durationSec: number;
  onTogglePause: () => void;
}

export function MiniControlBar({ phase, progressSec, durationSec, onTogglePause }: MiniControlBarProps) {
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(waveRef, 5, 32, 160);
  const isIdle = phase === 'idle';
  const isPaused = phase === 'paused';
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

      <button
        type="button"
        className={styles.btn}
        onClick={onTogglePause}
        disabled={isIdle}
        aria-label={isPaused || isIdle ? 'Play' : 'Pause'}
      >
        {isPaused || isIdle ? <IconPlay size={16} /> : <IconPause size={16} />}
      </button>
    </footer>
  );
}
