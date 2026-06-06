import { useEffect, useRef } from 'react';
import { useRadioActions, useRadioState } from '../context/RadioSessionContext';
import { useLayoutMode } from '../hooks/useMediaQuery';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import { isCurating, isIdle } from '../lib/playbackSelectors';
import { IconPlay } from './Icons';
import styles from './TranscriptPanel.module.css';

interface TranscriptPanelProps {
  djName: string;
}

export function TranscriptPanel({ djName }: TranscriptPanelProps) {
  const state = useRadioState();
  const { handleStart } = useRadioActions();
  const { isWide } = useLayoutMode();
  const scrollRef = useRef<HTMLDivElement>(null);
  const idle = isIdle(state.phase);
  const showStartOverlay = idle && isWide;

  useEffect(() => {
    if (!state.activeTranscriptId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-id="${state.activeTranscriptId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [state.activeTranscriptId]);

  return (
    <div className={styles.root}>
      <div ref={scrollRef} className={styles.scroll}>
        {state.transcript.length === 0 && !idle && (
          <p className={styles.empty}>
            {isCurating(state.phase) ? 'Curating your session…' : 'Waiting for DJ…'}
          </p>
        )}

        {state.transcript.map((line) => {
          const isActive = line.id === state.activeTranscriptId;
          const activeIndex = state.activeTranscriptId
            ? state.transcript.findIndex((l) => l.id === state.activeTranscriptId)
            : -1;
          const lineIndex = state.transcript.findIndex((l) => l.id === line.id);
          const isPast = activeIndex >= 0 && lineIndex < activeIndex;
          return (
            <article
              key={line.id}
              data-id={line.id}
              className={cn(
                isActive && styles.lineActive,
                isPast && styles.linePast,
                !isActive && !isPast && styles.lineUpcoming,
              )}
            >
              <p className={styles.lineMeta}>
                {line.role === 'model' ? djName : 'You'} · {formatTime(line.elapsedSec)}
              </p>
              <p className={styles.lineBody}>{line.text}</p>
            </article>
          );
        })}
      </div>

      {showStartOverlay && (
        <div className={styles.overlay}>
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
      )}
    </div>
  );
}
