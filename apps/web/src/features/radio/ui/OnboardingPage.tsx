import type { SessionIntent } from '@auracle/shared';
import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { isCurating } from '@/features/radio/session/playbackSelectors';
import { DJ_NAME } from '@/shared/lib/constants';
import { IntentOnboarding } from './IntentOnboarding';
import styles from './OnboardingPage.module.css';

/**
 * Full-screen intent picker shown before the player mounts. While session
 * creation is in flight (`curating`), the same screen stays mounted with its
 * controls disabled.
 */
export function OnboardingPage() {
  const state = useRadioState();
  const { handleStart } = useRadioActions();
  const curating = isCurating(state.phase);

  return (
    <div className={styles.page}>
      <main className={styles.frame}>
        <header className={styles.brand}>
          <span className={styles.logo} aria-hidden>
            {DJ_NAME.charAt(0)}
          </span>
          <div>
            <h1 className={styles.name}>{DJ_NAME}</h1>
            <p className={styles.tagline}>Not a playlist. A station.</p>
          </div>
        </header>
        <IntentOnboarding
          onStart={(intent: SessionIntent) => void handleStart(intent)}
          disabled={curating}
        />
      </main>
    </div>
  );
}
