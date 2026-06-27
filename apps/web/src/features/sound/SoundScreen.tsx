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
    <div className={`${styles.page} ${isGuest ? styles.guestPage : ''}`}>
      <header className={styles.header}>
        <div className={styles.navRow}>
          <button className={styles.backButton} type="button" onClick={onClose}>
            Back
          </button>
          <span className={styles.contextLabel}>Auracle Sound</span>
        </div>
        <div className={styles.heroGrid}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Personal tuning</p>
            <h1>Your sound, tuned for every station.</h1>
            <p>
              Shape the DJ's taste layer with the artists, genres, and tracks that should pull the
              room closer to you.
            </p>
          </div>
          <div className={styles.signalPanel} aria-hidden>
            <span>
              <strong>L1</strong>
              Explicit taste
            </span>
            <span>
              <strong>L2</strong>
              Listening signals
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
                Choose the musical gravity for your station. Keep it light: a few strong signals
                beat a long checklist.
              </p>
              <TastePanel />
            </section>

            <div className={styles.supportGrid}>
              <section className={styles.block} aria-labelledby="sound-learned-title">
                <div className={styles.blockHeader}>
                  <h2 id="sound-learned-title">Learned</h2>
                  <span className={styles.badge}>mem0</span>
                </div>
                <p className={styles.blockCopy}>
                  Facts gathered from DJ conversation and session context.
                </p>
                <div className={styles.emptyState}>No learned preferences yet.</div>
              </section>

              <section className={styles.block} aria-labelledby="sound-signals-title">
                <div className={styles.blockHeader}>
                  <h2 id="sound-signals-title">Signals</h2>
                  <span className={styles.badge}>Behavior</span>
                </div>
                <p className={styles.blockCopy}>
                  Skip and completion patterns that softly steer energy.
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
