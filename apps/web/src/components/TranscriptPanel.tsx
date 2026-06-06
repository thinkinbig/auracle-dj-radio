import { useEffect, useRef } from 'react';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import type { TranscriptLine, UiPhase } from '../types';
import { IconPlay } from './Icons';
import styles from './TranscriptPanel.module.css';

interface TranscriptPanelProps {
  phase: UiPhase;
  lines: TranscriptLine[];
  activeId: string | null;
  djName: string;
  onStart: () => void;
}

export function TranscriptPanel({
  phase,
  lines,
  activeId,
  djName,
  onStart,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isIdle = phase === 'idle';

  useEffect(() => {
    if (!activeId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-id="${activeId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  return (
    <div className={styles.root}>
      <div ref={scrollRef} className={styles.scroll}>
        {lines.length === 0 && !isIdle && (
          <p className={styles.empty}>Waiting for DJ…</p>
        )}

        {lines.map((line) => {
          const isActive = line.id === activeId;
          const activeIndex = activeId ? lines.findIndex((l) => l.id === activeId) : -1;
          const lineIndex = lines.findIndex((l) => l.id === line.id);
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

      {isIdle && (
        <div className={styles.overlay}>
          <button type="button" className={styles.startBtn} onClick={onStart} aria-label="Tap to start session">
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
