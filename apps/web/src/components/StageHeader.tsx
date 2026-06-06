import { useEffect, useRef, useState } from 'react';
import type { HostMode } from '@auracle/shared';
import { useRadioActions, useRadioAnalyser, useRadioState } from '../context/RadioSessionContext';
import { useLayoutMode } from '../hooks/useMediaQuery';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import { DJ_NAME } from '../lib/constants';
import {
  hostModeDisabled,
  isIdle,
  isOnAir,
  isPaused,
  statusLabel,
} from '../lib/playbackSelectors';
import styles from './StageHeader.module.css';
import { StageWaveform } from './StageWaveform';
import { IconPlay } from './Icons';

const HOST_MODE_OPTIONS: Array<{ value: HostMode; label: string }> = [
  { value: 'curator', label: 'Guide' },
  { value: 'set_dj', label: 'Quiet' },
  { value: 'hype', label: 'Energy' },
];

export function StageHeader() {
  const state = useRadioState();
  const analyser = useRadioAnalyser();
  const { handleStart, handleChangeHostMode } = useRadioActions();
  const { isWide } = useLayoutMode();
  const status = statusLabel(state.phase);
  const onAir = isOnAir(state);
  const paused = isPaused(state.phase);
  const modeDisabled = hostModeDisabled(state);
  const showStageArt = isWide && Boolean(state.albumCoverUrl);
  const canStartFromStage = showStageArt && isIdle(state.phase);
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
        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden>
            {DJ_NAME.charAt(0).toUpperCase()}
          </div>
          <span className={styles.name}>{DJ_NAME}</span>
        </div>
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

      {showStageArt ? (
        <div className={styles.artArea}>
          {canStartFromStage ? (
            <button
              type="button"
              className={styles.artStartBtn}
              onClick={() => void handleStart()}
              aria-label="Tap to start session"
            >
              <div className={styles.artStack}>
                <img className={styles.albumCover} src={state.albumCoverUrl} alt="" />
                {state.artistPhotoUrl && (
                  <img
                    className={styles.artistBadge}
                    src={state.artistPhotoUrl}
                    alt=""
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span className={styles.artPlayOverlay} aria-hidden>
                  <span className={styles.artPlayIcon}>
                    <IconPlay size={24} />
                  </span>
                </span>
              </div>
            </button>
          ) : (
            <div className={styles.artStack}>
              <img className={styles.albumCover} src={state.albumCoverUrl} alt="" />
              {state.artistPhotoUrl && (
                <img
                  className={styles.artistBadge}
                  src={state.artistPhotoUrl}
                  alt=""
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <StageWaveform phase={state.phase} analyser={analyser} />
      )}
    </header>
  );
}
