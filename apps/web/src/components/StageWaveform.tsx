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
  /** Listener holds the floor: drive the bars from the mic and force the live look. */
  talking?: boolean;
}

export function StageWaveform({ phase, analyser, talking = false }: StageWaveformProps) {
  const barsRef = useRef<HTMLDivElement>(null);
  const barCount = useBarCount(barsRef, 4, 28, 120);
  const live = !talking && (phase === 'speaking' || phase === 'listening');
  const playing = !talking && phase === 'playing';
  const mode = talking || live ? 'live' : playing ? 'playing' : 'idle';

  useWaveform(barsRef, mode, barCount, analyser);

  return (
    <div
      ref={barsRef}
      className={cn(styles.root, talking && styles.talking, live && styles.live, playing && styles.playing)}
      style={{ '--bar-count': barCount } as CSSProperties}
      aria-hidden
    >
      {Array.from({ length: barCount }, (_, i) => (
        <span key={i} className={styles.bar} data-wave-bar />
      ))}
    </div>
  );
}
