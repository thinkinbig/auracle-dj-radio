import { useEffect, useRef, useState } from 'react';
import type { HostMode } from '@auracle/shared';
import { useLayoutMode } from '../hooks/useMediaQuery';
import { formatTime } from '../lib/formatTime';
import { cn } from '../lib/cn';
import type { UiPhase } from '../types';
import styles from './StageHeader.module.css';
import { StageWaveform } from './StageWaveform';
import { IconPlay } from './Icons';

interface StageHeaderProps {
  djName: string;
  phase: UiPhase;
  sessionElapsedSec: number;
  analyser: AnalyserNode | null;
  liveWarning: string | null;
  hostMode: HostMode;
  onChangeHostMode: (hostMode: HostMode) => void;
  onStart?: () => void;
  albumCoverUrl?: string;
  artistPhotoUrl?: string;
}

const HOST_MODE_OPTIONS: Array<{ value: HostMode; label: string }> = [
  { value: 'set_dj', label: 'Quiet' },
  { value: 'curator', label: 'Guide' },
  { value: 'hype', label: 'Energy' },
  { value: 'minimal', label: 'Minimal' },
];

function statusLabel(phase: UiPhase): { text: string; live: boolean } {
  switch (phase) {
    case 'curating':
      return { text: 'Tuning in…', live: true };
    case 'opening':
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

export function StageHeader({
  djName,
  phase,
  sessionElapsedSec,
  analyser,
  liveWarning,
  hostMode,
  onChangeHostMode,
  onStart,
  albumCoverUrl,
  artistPhotoUrl,
}: StageHeaderProps) {
  const { isWide } = useLayoutMode();
  const status = statusLabel(phase);
  const onAir = phase !== 'idle';
  const isPaused = phase === 'paused';
  const hostModeDisabled = phase === 'idle' || phase === 'curating';
  const showStageArt = isWide && Boolean(albumCoverUrl);
  const canStartFromStage = showStageArt && phase === 'idle' && Boolean(onStart);
  const mountedRef = useRef(false);
  const [modeToast, setModeToast] = useState<string | null>(null);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const label = HOST_MODE_OPTIONS.find((o) => o.value === hostMode)?.label ?? hostMode;
    setModeToast(`Host mode: ${label}`);
    const id = window.setTimeout(() => setModeToast(null), 1800);
    return () => window.clearTimeout(id);
  }, [hostMode]);

  return (
    <header className={styles.root}>
      <div className={styles.top}>
        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden>
            {djName.charAt(0).toUpperCase()}
          </div>
          <span className={styles.name}>{djName}</span>
        </div>
        <div className={styles.topRight}>
          {onAir && (
            <span
              className={cn(styles.onAir, isPaused && styles.onAirDim)}
              aria-label={isPaused ? 'On air, paused' : 'On air'}
            >
              ON AIR
            </span>
          )}
          <time className={styles.timer} aria-label="Session elapsed">
            {formatTime(sessionElapsedSec)}
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
            const active = hostMode === o.value;
            return (
              <button
                key={o.value}
                type="button"
                className={cn(styles.modePill, active && styles.modePillActive)}
                onClick={() => onChangeHostMode(o.value)}
                disabled={hostModeDisabled}
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
      {liveWarning && (
        <p className={styles.warning} role="status" aria-live="polite">
          {liveWarning}
        </p>
      )}

      {showStageArt ? (
        <div className={styles.artArea}>
          {canStartFromStage ? (
            <button
              type="button"
              className={styles.artStartBtn}
              onClick={onStart}
              aria-label="Tap to start session"
            >
              <div className={styles.artStack}>
                <img className={styles.albumCover} src={albumCoverUrl} alt="" />
                {artistPhotoUrl && (
                  <img
                    className={styles.artistBadge}
                    src={artistPhotoUrl}
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
              <img className={styles.albumCover} src={albumCoverUrl} alt="" />
              {artistPhotoUrl && (
                <img
                  className={styles.artistBadge}
                  src={artistPhotoUrl}
                  alt=""
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
          )}
        </div>
      ) : (
        <StageWaveform phase={phase} analyser={analyser} />
      )}
    </header>
  );
}
