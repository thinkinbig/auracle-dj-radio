import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useRadioActions, useRadioState } from '../context/RadioSessionContext';
import { useBarCount } from '../hooks/useBarCount';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import {
  canSkipTrack,
  isCurating,
  isIdle,
  isPaused,
  playbackProgressPct,
} from '../lib/playbackSelectors';
import { IconMic, IconPause, IconPlay, IconSkipNext, IconSkipVoice } from './Icons';
import styles from './MiniControlBar.module.css';

export function MiniControlBar() {
  const state = useRadioState();
  const { handleStart, handleTogglePause, handleSkipTrack, handleSkipDj, handleContinue } =
    useRadioActions();
  const waveRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(waveRef, 5, 32, 160);
  const paused = isPaused(state.phase);
  const idle = isIdle(state.phase);
  const curating = isCurating(state.phase);
  const skipDisabled = !canSkipTrack(state);
  const pct = playbackProgressPct(state);

  return (
    <footer className={styles.root} aria-label="Playback controls">
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

      {state.phase === 'speaking' && (
        <button
          type="button"
          className={styles.btn}
          onClick={handleSkipDj}
          aria-label="Skip voice-over"
        >
          <IconSkipVoice size={16} />
        </button>
      )}

      {state.inBreak ? (
        <button
          type="button"
          className={styles.continueBtn}
          onClick={handleContinue}
          aria-label="Continue to next track"
        >
          {state.phase === 'listening' ? <IconMic size={14} /> : null}
          Continue
        </button>
      ) : (
        <button
          type="button"
          className={styles.btn}
          onClick={handleSkipTrack}
          disabled={skipDisabled}
          aria-label="Next track"
        >
          <IconSkipNext size={16} />
        </button>
      )}

      <button
        type="button"
        className={styles.btn}
        onClick={idle ? () => void handleStart() : handleTogglePause}
        disabled={curating}
        aria-label={idle || paused ? 'Start session' : 'Pause'}
      >
        {idle || paused ? <IconPlay size={16} /> : <IconPause size={16} />}
      </button>
    </footer>
  );
}
