import type { AuthUser } from '@auracle/shared';
import { TastePanel } from './TastePanel';
import styles from './SoundScreen.module.css';

interface SoundScreenProps {
  user: AuthUser;
  onClose: () => void;
}

export function SoundScreen({ user, onClose }: SoundScreenProps) {
  const isGuest = user.id === 'guest';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backButton} type="button" onClick={onClose}>
          Back
        </button>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Taste engineering</p>
          <h1>Your sound</h1>
        </div>
      </header>

      <main className={styles.main}>
        {isGuest ? (
          <section className={styles.notice} aria-live="polite">
            <strong>Sign in to build your sound</strong>
            <p>
              Guest mode runs a demo station only. Create an account to save structured taste,
              learned preferences, and listening signals across sessions.
            </p>
          </section>
        ) : (
          <p className={styles.lede}>
            Your sound shapes every station — explicit taste, what the DJ learns, and how you listen.
          </p>
        )}

        <section className={styles.block} aria-labelledby="sound-taste-title">
          <div className={styles.blockHeader}>
            <h2 id="sound-taste-title">Your taste</h2>
            <span className={styles.badge}>L1 · Structured</span>
          </div>
          <p className={styles.blockCopy}>
            Genre, artist, album, and track prefer / avoid — the reproducible layer for planning.
          </p>
          {isGuest ? (
            <div className={styles.emptyState}>Sign in to set and save your taste.</div>
          ) : (
            <TastePanel />
          )}
        </section>

        <section className={styles.block} aria-labelledby="sound-learned-title">
          <div className={styles.blockHeader}>
            <h2 id="sound-learned-title">Learned</h2>
            <span className={styles.badge}>L3 · mem0</span>
          </div>
          <p className={styles.blockCopy}>
            Facts gathered from DJ conversation and session context — read-only summaries here.
          </p>
          <div className={styles.emptyState}>No learned preferences yet.</div>
        </section>

        <section className={styles.block} aria-labelledby="sound-signals-title">
          <div className={styles.blockHeader}>
            <h2 id="sound-signals-title">Signals</h2>
            <span className={styles.badge}>L2 · Behavior</span>
          </div>
          <p className={styles.blockCopy}>
            Skip and completion patterns that softly steer energy and replanning.
          </p>
          <div className={styles.emptyState}>Listening signals appear after a few sessions.</div>
        </section>
      </main>
    </div>
  );
}
