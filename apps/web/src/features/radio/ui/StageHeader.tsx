import {
  useRadioAnalyser,
  useRadioMicAnalyser,
  useRadioState,
} from '@/features/radio/session/RadioSessionContext';
import { formatTime } from '@/shared/lib/formatTime';
import { cn } from '@/shared/lib/cn';
import {
  isOnAir,
  isPaused,
  isSessionComplete,
  selectQueueRefresh,
  statusLabel,
} from '@/features/radio/session/playbackSelectors';
import styles from './StageHeader.module.css';
import { StageWaveform } from './StageWaveform';

export function StageHeader() {
  const state = useRadioState();
  const analyser = useRadioAnalyser();
  const micAnalyser = useRadioMicAnalyser();
  const status = statusLabel(state.phase, state.queueRefreshStatus);
  const onAir = isOnAir(state);
  const paused = isPaused(state.phase);
  const conversation = state.transcript.slice(-5);
  // Queue-state axis: surface an in-flight rolling extend/regenerate here too, so it
  // stays visible while the station keeps playing even when the queue sidebar is
  // hidden (narrow layouts). At `complete` the status pill above already says it.
  const refresh = selectQueueRefresh(state);
  const showRefreshHint = refresh.pending && !isSessionComplete(state.phase);
  const refreshHintLabel = refresh.intent === 'regenerate' ? 'Rebuilding the queue…' : 'Finding more music…';

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

      {showRefreshHint && (
        <p className={styles.refreshHint} role="status" aria-live="polite">
          <span className={cn(styles.liveDot, styles.liveDotOn)} aria-hidden />
          {refreshHintLabel}
        </p>
      )}

      {state.liveWarning && (
        <p className={styles.warning} role="status" aria-live="polite">
          Demo voice fallback
        </p>
      )}

      <div className={styles.hostCopy}>
        <div className={styles.dialoguePanel} aria-label="AI host conversation" aria-live="polite">
          {conversation.length > 0 ? (
            conversation.map((line) => (
              <article
                key={line.id}
                className={cn(styles.dialogueLine, line.role === 'user' && styles.dialogueLineUser)}
              >
                <p>{line.text}</p>
              </article>
            ))
          ) : (
            <p className={styles.dialogueEmpty}>Your conversation with the AI host will appear here.</p>
          )}
        </div>
      </div>

      <div className={styles.orbArea} aria-hidden>
        <div className={styles.orb}>
          <span className={styles.orbGlow} />
          <span className={styles.orbLine} />
          <span className={styles.orbLine} />
          <span className={styles.orbLine} />
          <span className={styles.orbLine} />
        </div>
      </div>

      {/* The waveform always renders so the stage shows a live visualizer; on wide
          layouts it sits as a glowing strip beneath the album art. */}
      <div className={styles.stageWave}>
        <StageWaveform
          phase={state.phase}
          analyser={state.phase === 'listening' ? micAnalyser : analyser}
          talking={state.phase === 'listening'}
        />
      </div>
    </header>
  );
}
