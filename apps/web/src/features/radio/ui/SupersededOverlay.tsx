import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import styles from './SupersededOverlay.module.css';

/**
 * Shown when this session was superseded by the same user starting a set on
 * another device (issue #55). Playback is already stopped by the reducer; this
 * surfaces a calm, non-crash explanation and a single way forward — start fresh
 * on this device.
 */
export function SupersededOverlay() {
  const { superseded } = useRadioState();
  const { handleReturnToSetup } = useRadioActions();

  if (!superseded) return null;

  return (
    <div className={styles.backdrop} role="alertdialog" aria-modal="true" aria-labelledby="superseded-title">
      <div className={styles.card}>
        <p className={styles.kicker}>Playback moved</p>
        <h2 id="superseded-title">Playing on another device</h2>
        <p className={styles.body}>
          You started a new session somewhere else, so this one stopped. Your taste and memory carry
          over — pick up a fresh set here whenever you like.
        </p>
        <button type="button" className={styles.primary} onClick={handleReturnToSetup}>
          Start a new set
        </button>
      </div>
    </div>
  );
}
