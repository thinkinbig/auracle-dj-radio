import type { SessionIntent } from '@auracle/shared';
import { evalMode } from '@/shared/lib/evalMode';
import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { isCurating } from '@/features/radio/session/playbackSelectors';
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
      <main className={styles.frame} aria-labelledby="mood-title">
        <section className={styles.copy}>
          <p className={styles.eyebrow}>Set your station</p>
          <h1 id="mood-title">Ready when you are.</h1>
          <p className={styles.lede}>Choose your mood and moment. Your sound shapes what plays next.</p>
          {evalMode ? (
            <p className={styles.evalNote}>User study: sign in with your assigned account before starting.</p>
          ) : null}
          <div className={styles.previewPanel} aria-hidden>
            <div className={styles.albumPreview}>
              <div className={styles.albumBack} />
              <div className={styles.albumArt}>
                <span />
              </div>
            </div>
            <div className={styles.previewText}>
              <span>Next up</span>
              <strong>Adaptive mix</strong>
              <small>Live DJ flow</small>
            </div>
          </div>
        </section>

        <section className={styles.intentCard}>
          <IntentOnboarding
            onStart={(intent: SessionIntent) => void handleStart(intent)}
            disabled={curating}
          />
        </section>
      </main>
    </div>
  );
}
