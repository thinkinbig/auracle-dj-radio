import { formatTime } from '../lib/formatTime';
import type { TranscriptLine, UiPhase } from '../types';
import { IconPause, IconPlay, IconSkipNext } from './Icons';
import { TranscriptPanel } from './TranscriptPanel';
import styles from './ContentSheet.module.css';

interface ContentSheetProps {
  phase: UiPhase;
  sessionTitle: string;
  sessionSubtitle: string;
  trackTitle: string;
  artist: string;
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
  const isPaused = phase === 'paused';
  const isIdle = phase === 'idle';
  const notReady = isIdle || phase === 'curating';
  const skipDisabled = notReady || !hasNextTrack;
  const pct = durationSec > 0 ? Math.min(100, (progressSec / durationSec) * 100) : 0;

  return (
    <section className={styles.root} aria-label="Now playing">
      <div className={styles.header}>
        <h1 className={styles.title}>{sessionTitle}</h1>
        <p className={styles.meta}>{sessionSubtitle}</p>
        <p className={styles.trackLine}>
          {trackTitle} — {artist}
        </p>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={onTogglePause}
          disabled={notReady}
          aria-label={isPaused || notReady ? 'Play' : 'Pause'}
        >
          {isPaused || notReady ? <IconPlay size={18} /> : <IconPause size={18} />}
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

      <TranscriptPanel
        phase={phase}
        lines={transcript}
        activeId={activeTranscriptId}
        djName={djName}
        onStart={onStart}
      />
    </section>
  );
}
