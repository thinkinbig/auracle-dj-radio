import { useEffect, useRef, useState } from 'react';
import type { HostMode } from '@auracle/shared';
import {
  useRadioActions,
  useRadioAnalyser,
  useRadioMicAnalyser,
  useRadioState,
} from '@/features/radio/session/RadioSessionContext';
import { useLayoutMode } from '@/shared/hooks/useMediaQuery';
import { formatTime } from '@/shared/lib/formatTime';
import { cn } from '@/shared/lib/cn';
import {
  hostModeDisabled,
  isOnAir,
  isPaused,
  statusLabel,
} from '@/features/radio/session/playbackSelectors';
import styles from './StageHeader.module.css';
import { StageWaveform } from './StageWaveform';
const HOST_MODE_OPTIONS: Array<{ value: HostMode; label: string }> = [
  { value: 'curator', label: 'Guide' },
  { value: 'set_dj', label: 'Quiet' },
  { value: 'hype', label: 'Energy' },
];

export function StageHeader() {
  const state = useRadioState();
  const analyser = useRadioAnalyser();
  const micAnalyser = useRadioMicAnalyser();
  const { handleChangeHostMode } = useRadioActions();
  const { isWide } = useLayoutMode();
  const status = statusLabel(state.phase);
  const onAir = isOnAir(state);
  const paused = isPaused(state.phase);
  const modeDisabled = hostModeDisabled(state);
  const showStageArt = isWide && Boolean(state.albumCoverUrl);
  const mountedRef = useRef(false);
  const [modeToast, setModeToast] = useState<string | null>(null);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const label = HOST_MODE_OPTIONS.find((o) => o.value === state.hostMode)?.label ?? state.hostMode;
    setModeToast(`Host mode: ${label}`);
    const id = window.setTimeout(() => setModeToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [state.hostMode]);

  return (
    <header className={styles.root}>
      <div className={styles.top}>
        <div className={styles.topRight}>
          {onAir && (
            <span
              className={cn(styles.onAir, paused && styles.onAirDim)}
              aria-label={paused ? 'On air, paused' : 'On air'}
            >
              ON AIR
            </span>
          )}
          <time className={styles.timer} aria-label="Session elapsed">
            {formatTime(state.sessionElapsedSec)}
          </time>
        </div>
      </div>

      <p className={styles.status} aria-live="polite">
        <span className={cn(styles.liveDot, status.live && styles.liveDotOn)} aria-hidden />
        {status.text}
      </p>
      <div className={styles.modeSection} aria-label="Host mode">
        <span className={styles.modeTitle}>Host mode</span>
        <div className={styles.modePills}>
          {HOST_MODE_OPTIONS.map((o) => {
            const active = state.hostMode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                className={cn(styles.modePill, active && styles.modePillActive)}
                onClick={() => handleChangeHostMode(o.value)}
                disabled={modeDisabled}
                aria-pressed={active}
                aria-label={`Switch host mode to ${o.label}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {modeToast && (
        <p className={styles.modeToast} role="status" aria-live="polite">
          {modeToast}
        </p>
      )}
      {state.liveWarning && (
        <p className={styles.warning} role="status" aria-live="polite">
          {state.liveWarning}
        </p>
      )}

      {showStageArt && (
        <div className={styles.artArea}>
          <div className={styles.artStack}>
            <img className={styles.albumCover} src={state.albumCoverUrl} alt="" />
          </div>
        </div>
      )}
      {/* The waveform always renders so the stage shows a live visualizer; on wide
          layouts it sits as a glowing strip beneath the album art. */}
      <StageWaveform
        phase={state.phase}
        analyser={state.isTalking ? micAnalyser : analyser}
        talking={state.isTalking}
      />
    </header>
  );
}
