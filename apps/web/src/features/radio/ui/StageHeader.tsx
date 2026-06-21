import {
  useRadioAnalyser,
  useRadioMicAnalyser,
  useRadioState,
} from '@/features/radio/session/RadioSessionContext';
import { useLayoutMode } from '@/shared/hooks/useMediaQuery';
import { formatTime } from '@/shared/lib/formatTime';
import { cn } from '@/shared/lib/cn';
import {
  isOnAir,
  isPaused,
  statusLabel,
} from '@/features/radio/session/playbackSelectors';
import styles from './StageHeader.module.css';
import { StageWaveform } from './StageWaveform';

export function StageHeader() {
  const state = useRadioState();
  const analyser = useRadioAnalyser();
  const micAnalyser = useRadioMicAnalyser();
  const { isWide } = useLayoutMode();
  const status = statusLabel(state.phase);
  const onAir = isOnAir(state);
  const paused = isPaused(state.phase);
  const showStageArt = isWide && Boolean(state.albumCoverUrl);

  return (
    <header className={styles.root}>
      <div className={styles.top}>
        <p className={styles.status} aria-live="polite">
          <span className={cn(styles.liveDot, status.live && styles.liveDotOn)} aria-hidden />
          {status.text}
        </p>
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

      {state.liveWarning && (
        <p className={styles.warning} role="status" aria-live="polite">
          Demo voice fallback
        </p>
      )}

      {showStageArt && (
        <div className={styles.artArea}>
          <div className={styles.artStack}>
            <span className={styles.artAura} aria-hidden />
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
