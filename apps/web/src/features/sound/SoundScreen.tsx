import type { AuthUser } from '@auracle/shared';
import { AppBrand } from '@/features/marketing/AppBrand';
import { TastePanel } from './TastePanel';
import styles from './SoundScreen.module.css';

interface SoundScreenProps {
  user: AuthUser;
  onClose: () => void;
  onOpenImport?: () => void;
}

export function SoundScreen({ user, onClose, onOpenImport }: SoundScreenProps) {
  const isGuest = user.id === 'guest';

  return (
    <div className={`${styles.page} ${isGuest ? styles.guestPage : ''}`}>
      <AppBrand onClick={onClose} label="Back to Auracle" />
      <header className={styles.header}>
        <div className={styles.navRow}>
          <button className={styles.backButton} type="button" onClick={onClose}>
            Back
          </button>
          <span className={styles.contextLabel}>My Sound</span>
        </div>
        <div className={styles.heroGrid}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Personal tuning</p>
            <h1>Make every station sound more like you.</h1>
            <p>
              Choose the genres, artists, albums, and tracks Auracle should follow or avoid when it
              builds your radio.
            </p>
          </div>
          <div className={styles.signalPanel} aria-hidden>
            <span>
              <strong>L1</strong>
              Your picks
            </span>
            <span>
              <strong>L2</strong>
              Listening history
            </span>
            <span>
              <strong>L3</strong>
              DJ memory
            </span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {isGuest ? (
          <section className={styles.guestGate} aria-live="polite">
            <div>
              <p className={styles.kicker}>Login required</p>
              <h2>Build a sound that follows you.</h2>
              <p>
                Guest mode plays a demo station. Sign in to save taste, learned preferences, and
                listening signals across sessions.
              </p>
            </div>
            <button className={styles.backToDemo} type="button" onClick={onClose}>
              Back to demo
            </button>
          </section>
        ) : (
          <>
            <section className={styles.tasteSection} aria-labelledby="sound-taste-title">
              <div className={styles.blockHeader}>
                <div>
                  <p className={styles.kicker}>Now editing</p>
                  <h2 id="sound-taste-title">Taste profile</h2>
                </div>
                <span className={styles.badge}>Structured</span>
              </div>
              <p className={styles.blockCopy}>
                Set a few strong signals first. Auracle uses these choices when it builds future
                stations.
              </p>
              <TastePanel />
            </section>

            <div className={styles.supportGrid}>
              <section className={styles.block} aria-labelledby="sound-archive-title">
                <div className={styles.blockHeader}>
                  <h2 id="sound-archive-title">Music history</h2>
                  <span className={styles.badge}>Import</span>
                </div>
                <p className={styles.blockCopy}>
                  Bring in playlists from the past so Auracle can understand your long-term taste.
                </p>
                <button className={styles.importButton} type="button" onClick={onOpenImport}>
                  Import Music
                </button>
              </section>

              <section className={styles.block} aria-labelledby="sound-learned-title">
                <div className={styles.blockHeader}>
                  <h2 id="sound-learned-title">Learned taste</h2>
                  <span className={styles.badge}>mem0</span>
                </div>
                <p className={styles.blockCopy}>
                  Things Auracle learns from conversations and completed sessions.
                </p>
                <div className={styles.emptyState}>No learned preferences yet.</div>
              </section>

              <section className={styles.block} aria-labelledby="sound-signals-title">
                <div className={styles.blockHeader}>
                  <h2 id="sound-signals-title">Listening signals</h2>
                  <span className={styles.badge}>Behavior</span>
                </div>
                <p className={styles.blockCopy}>
                  Skips, likes, and completed tracks will help future stations feel more precise.
                </p>
                <div className={styles.emptyState}>Listening signals appear after a few sessions.</div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
