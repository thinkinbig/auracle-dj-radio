import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useBarCount } from '../hooks/useBarCount';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import type { UiPhase } from '../types';
import { IconPause, IconPlay, IconSkipNext, IconSkipVoice } from './Icons';
import styles from './MiniControlBar.module.css';

interface MiniControlBarProps {
  phase: UiPhase;
  progressSec: number;
  durationSec: number;
  hasNextTrack: boolean;
  onStart: () => void;
  onTogglePause: () => void;
  onSkipTrack: () => void;
  onSkipDj: () => void;
}

export function MiniControlBar({
  phase,
  progressSec,
  durationSec,
  hasNextTrack,
  onStart,
  onTogglePause,
  onSkipTrack,
  onSkipDj,
}: MiniControlBarProps) {
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(waveRef, 5, 32, 160);
  const isPaused = phase === 'paused';
  const isIdle = phase === 'idle';
  const isCurating = phase === 'curating';
  const skipDisabled = isIdle || isCurating || !hasNextTrack;
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

      {phase === 'speaking' && (
        <button
          type="button"
          className={styles.btn}
          onClick={onSkipDj}
          aria-label="Skip voice-over"
        >
          <IconSkipVoice size={16} />
        </button>
      )}

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
        onClick={isIdle ? onStart : onTogglePause}
        disabled={isCurating}
        aria-label={isIdle || isPaused ? 'Start session' : 'Pause'}
      >
        {isIdle || isPaused ? <IconPlay size={16} /> : <IconPause size={16} />}
      </button>
    </footer>
  );
}
