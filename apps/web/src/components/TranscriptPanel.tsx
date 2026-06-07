import { useEffect, useRef } from 'react';
import { useRadioState } from '../context/RadioSessionContext';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import { isCurating } from '../lib/playbackSelectors';
import { Skeleton } from './Skeleton';
import styles from './TranscriptPanel.module.css';

interface TranscriptPanelProps {
  djName: string;
}

const SKELETON_LINES = [
  { metaW: '28%', bodyW: '92%' },
  { metaW: '22%', bodyW: '78%' },
  { metaW: '26%', bodyW: '85%' },
] as const;

export function TranscriptPanel({ djName }: TranscriptPanelProps) {
  const state = useRadioState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const curating = isCurating(state.phase);

  useEffect(() => {
    if (!state.activeTranscriptId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-id="${state.activeTranscriptId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [state.activeTranscriptId]);

  return (
    <div className={styles.root} aria-busy={curating || undefined}>
      <div ref={scrollRef} className={styles.scroll}>
        {curating && state.transcript.length === 0 ? (
          <div className={styles.skeletonList} aria-hidden>
            {SKELETON_LINES.map((line, i) => (
              <div key={i} className={styles.skeletonLine}>
                <Skeleton variant="text" height={12} width={line.metaW} />
                <Skeleton variant="text" height={16} width={line.bodyW} className={styles.skeletonBody} />
              </div>
            ))}
          </div>
        ) : null}

        {!curating && state.transcript.length === 0 ? (
          <p className={styles.empty}>Waiting for DJ…</p>
        ) : null}

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
    </div>
  );
}
