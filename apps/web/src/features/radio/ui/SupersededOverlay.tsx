import * as Dialog from '@radix-ui/react-dialog';
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

  return (
    <Dialog.Root open={superseded}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.backdrop} />
        <Dialog.Content className={styles.card} aria-describedby="superseded-body">
          <p className={styles.kicker}>Playback moved</p>
          <Dialog.Title asChild>
            <h2 id="superseded-title">Playing on another device</h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p id="superseded-body" className={styles.body}>
              You started a new session somewhere else, so this one stopped. Your Spotify taste carries over — pick
              up a fresh set here whenever you like.
            </p>
          </Dialog.Description>
          <button type="button" className={styles.primary} onClick={handleReturnToSetup}>
            Start a new set
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
