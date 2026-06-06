import { useRef } from 'react';
import type { CSSProperties } from 'react';
import { useBarCount } from '../hooks/useBarCount';
import { useWaveform } from '../hooks/useWaveform';
import { cn } from '../lib/cn';
import type { UiPhase } from '../types';
import styles from './StageWaveform.module.css';

interface StageWaveformProps {
  phase: UiPhase;
  analyser: AnalyserNode | null;
}

export function StageWaveform({ phase, analyser }: StageWaveformProps) {
  const barsRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(barsRef, 4, 28, 120);
  const live = phase === 'speaking' || phase === 'listening';
  const playing = phase === 'playing';
  const mode = live ? 'live' : playing ? 'playing' : 'idle';

  useWaveform(barsRef, mode, barCount, analyser);

  return (
    <div
      ref={barsRef}
      className={cn(styles.root, live && styles.live, playing && styles.playing)}
      style={{ '--bar-count': barCount } as CSSProperties}
      aria-hidden
    >
      {Array.from({ length: barCount }, (_, i) => (
        <span key={i} className={styles.bar} data-wave-bar />
      ))}
    </div>
  );
}
