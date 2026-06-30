import { useEffect, useMemo } from 'react';
import type { SessionIntent } from '@auracle/shared';
import { useAuth } from '@/features/marketing/AuthProvider';
import { firstNameFromUser } from '@/features/marketing/guest';
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
  const { user } = useAuth();
  if (!user) return null;
  const state = useRadioState();
  const { handleStart } = useRadioActions();
  const curating = isCurating(state.phase);
  const greeting = useMemo(() => getGreeting(new Date()), []);
  const firstName = firstNameFromUser(user);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.frame} aria-labelledby="mood-title">
        <section className={styles.copy}>
          <p className={styles.eyebrow}>{greeting}, {firstName}</p>
          <h1 id="mood-title">Let&apos;s build today&apos;s session.</h1>
          <p className={styles.lede}>Tell Auracle what&apos;s on your mind...</p>
          {evalMode ? (
            <p className={styles.evalNote}>User study: sign in with your assigned account before starting.</p>
          ) : null}
        </section>

        <section className={styles.intentCard}>
          <IntentOnboarding
            onStart={(intent: SessionIntent) => void handleStart(intent)}
            disabled={curating}
            tasteSummary="your Taste DNA"
            memorySummary="today's listening memory"
          />
        </section>
      </main>
    </div>
  );
}

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
