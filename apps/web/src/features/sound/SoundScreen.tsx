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
          <p className={styles.eyebrow}>Sound settings</p>
          <h1>Your sound</h1>
        </div>
      </header>

      <main className={styles.main}>
        {isGuest ? (
          <section className={styles.notice} aria-live="polite">
            <strong>Sign in to build your sound</strong>
            <p>
              Guest mode lets you try a demo station. Sign in to save what you like and keep improving future sessions.
            </p>
          </section>
        ) : (
          <p className={styles.lede}>
            Tune what Auracle plays for you, from favorite genres to the habits it learns over time.
          </p>
        )}

        <section className={styles.block} aria-labelledby="sound-taste-title">
          <div className={styles.blockHeader}>
            <h2 id="sound-taste-title">Your taste</h2>
            <span className={styles.badge}>You choose</span>
          </div>
          <p className={styles.blockCopy}>
            Pick the genres, artists, albums, and tracks you want Auracle to play more or less often.
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
            <span className={styles.badge}>DJ memory</span>
          </div>
          <p className={styles.blockCopy}>
            Preferences the DJ picks up from your conversations and listening sessions.
          </p>
          <div className={styles.emptyState}>No learned preferences yet.</div>
        </section>

        <section className={styles.block} aria-labelledby="sound-signals-title">
          <div className={styles.blockHeader}>
            <h2 id="sound-signals-title">Signals</h2>
            <span className={styles.badge}>Listening habits</span>
          </div>
          <p className={styles.blockCopy}>
            How your skips and finished listens help Auracle adjust future stations.
          </p>
          <div className={styles.emptyState}>Listening signals appear after a few sessions.</div>
        </section>
      </main>
    </div>
  );
}
