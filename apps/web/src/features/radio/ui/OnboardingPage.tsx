import { useEffect, useMemo, useState } from 'react';
import type { AuthUser, SessionIntent, TastePreference } from '@auracle/shared';
import { evalMode } from '@/shared/lib/evalMode';
import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { isCurating } from '@/features/radio/session/playbackSelectors';
import type { PlaybackState } from '@/features/radio/session/types';
import { fetchTaste } from '@/features/sound/tasteApi';
import { IntentOnboarding } from './IntentOnboarding';
import styles from './OnboardingPage.module.css';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Full-screen intent picker shown before the player mounts. While session
 * creation is in flight (`curating`), the same screen stays mounted with its
 * controls disabled.
 */
export function OnboardingPage({ user }: { user: AuthUser }) {
  const state = useRadioState();
  const { handleStart } = useRadioActions();
  const curating = isCurating(state.phase);
  const [tasteWords, setTasteWords] = useState<string[]>([]);
  const [tasteState, setTasteState] = useState<LoadState>('idle');
  const greeting = useMemo(() => getGreeting(new Date()), []);
  const firstName = user.name.split(/\s+/).filter(Boolean)[0] ?? 'there';
  const tasteSignals = useMemo(() => resolveTasteSignals(user, tasteWords, tasteState), [user, tasteWords, tasteState]);
  const lastSession = resolveLastSession(state, user);
  const tasteSummary = tasteWords.length > 0 ? 'your Taste DNA' : user.id === 'guest' ? 'demo taste signals' : 'emerging taste signals';

  useEffect(() => {
    if (user.id === 'guest') {
      setTasteWords([]);
      setTasteState('idle');
      return;
    }

    let cancelled = false;
    setTasteState('loading');

    void fetchTaste()
      .then((profile) => {
        if (cancelled) return;
        setTasteWords(resolveTasteWords(profile.preferences));
        setTasteState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setTasteWords([]);
        setTasteState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  return (
    <div className={styles.page}>
      <main className={styles.frame} aria-labelledby="mood-title">
        <section className={styles.copy}>
          <p className={styles.eyebrow}>{greeting}</p>
          <h1 id="mood-title">Let&apos;s build today&apos;s session.</h1>
          <p className={styles.lede}>
            Auracle listens for your mood, your moment, and the quiet signals that make this radio feel like yours, {firstName}.
          </p>
          {evalMode ? (
            <p className={styles.evalNote}>User study: sign in with your assigned account before starting.</p>
          ) : null}

          <div className={styles.signalStack} aria-label="Personal listening signals">
            <article className={styles.signalPanel}>
              <p className={styles.panelLabel}>Your Taste DNA</p>
              <div className={styles.signalList}>
                {tasteSignals.map((signal, index) => (
                  <span key={signal} className={styles.signalRow}>
                    <i className={styles.signalMark} data-tone={index} aria-hidden />
                    {signal}
                  </span>
                ))}
              </div>
            </article>

            <article className={styles.sessionPanel}>
              <p className={styles.panelLabel}>Last Session</p>
              <div className={styles.sessionMemory}>
                <span className={styles.sessionOrb} aria-hidden />
                <div>
                  <strong>{lastSession.title}</strong>
                  <small>{lastSession.meta}</small>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.intentCard}>
          <IntentOnboarding
            onStart={(intent: SessionIntent) => void handleStart(intent)}
            disabled={curating}
            tasteSummary={tasteSummary}
            memorySummary={lastSession.summary}
          />
        </section>
      </main>
    </div>
  );
}

function resolveTasteWords(preferences: TastePreference[]): string[] {
  const active = preferences.filter((preference) => preference.status !== 'orphaned');
  const preferred = active.filter((preference) => preference.polarity === 'prefer');
  const source = preferred.length > 0 ? preferred : active;

  return source
    .sort((a, b) => (b.strength ?? 1) - (a.strength ?? 1))
    .slice(0, 3)
    .map((preference) =>
      preference.polarity === 'avoid' ? `Avoid ${humanizeTasteId(preference.entityId)}` : humanizeTasteId(preference.entityId),
    );
}

function resolveTasteSignals(user: AuthUser, words: string[], state: LoadState): string[] {
  if (user.id === 'guest') return ['Demo taste signals', 'Unsaved radio memory', 'Fresh session'];
  if (state === 'loading') return ['Reading your profile', 'Syncing sound memory', 'Preparing signals'];
  if (state === 'error') return ['Taste sync pending', 'Use this moment', 'Auracle will adapt'];
  if (words.length > 0) return words;
  return ['First signals forming', 'Shape it today', 'Session will learn'];
}

function resolveLastSession(state: PlaybackState, user: AuthUser): { title: string; meta: string; summary: string } {
  if (state.sessionId) {
    return {
      title: state.sessionTitle,
      meta: `${state.sessionSubtitle} · ${formatSessionDuration(state.sessionElapsedSec)}`,
      summary: 'your last session',
    };
  }

  if (user.id === 'guest') {
    return {
      title: 'Guest station ready',
      meta: 'Preview mode keeps this session local.',
      summary: 'guest listening memory',
    };
  }

  return {
    title: 'First signal awaits',
    meta: 'Mood, context, and history will become today\'s radio.',
    summary: 'today\'s listening memory',
  };
}

function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function humanizeTasteId(entityId: string): string {
  return entityId
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

function formatSessionDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}
