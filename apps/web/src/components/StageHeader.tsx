import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import type { UiPhase } from '../types';
import styles from './StageHeader.module.css';
import { StageWaveform } from './StageWaveform';

interface StageHeaderProps {
  djName: string;
  phase: UiPhase;
  sessionElapsedSec: number;
}

function statusLabel(phase: UiPhase): { text: string; live: boolean } {
  switch (phase) {
    case 'speaking':
      return { text: 'Speaking…', live: true };
    case 'listening':
      return { text: 'Listening…', live: true };
    case 'playing':
      return { text: 'Playing…', live: false };
    case 'paused':
      return { text: 'Paused', live: false };
    default:
      return { text: 'Tap to start', live: false };
  }
}

export function StageHeader({ djName, phase, sessionElapsedSec }: StageHeaderProps) {
  const status = statusLabel(phase);

  return (
    <header className={styles.root}>
      <div className={styles.top}>
        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden>
            {djName.charAt(0).toUpperCase()}
          </div>
          <span className={styles.name}>{djName}</span>
        </div>
        <time className={styles.timer} aria-label="Session elapsed">
          {formatTime(sessionElapsedSec)}
        </time>
      </div>

      <p className={styles.status} aria-live="polite">
        <span className={cn(styles.liveDot, status.live && styles.liveDotOn)} aria-hidden />
        {status.text}
      </p>

      <StageWaveform phase={phase} />
    </header>
  );
}
