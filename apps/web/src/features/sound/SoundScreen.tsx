import { SpotifyTasteSummaryPanel } from '@/features/spotify/SpotifyTasteSummaryPanel';
import { FeaturePageShell } from '@/shared/ui/FeaturePageShell';
import styles from './SoundScreen.module.css';

export function SoundScreen() {
  return (
    <FeaturePageShell
      pageClassName={styles.page}
      headerClassName={styles.header}
      mainClassName={styles.main}
      hero={
        <div className={styles.heroGrid}>
          <div className={styles.headerCopy}>
            <h1>Your Spotify taste.</h1>
            <p>
              A quiet profile of the artists, tracks, genres, and listening patterns that shape
              your Auracle host.
            </p>
          </div>
        </div>
      }
    >
      <section className={styles.profileSection} aria-label="Spotify taste dashboard">
        <SpotifyTasteSummaryPanel />
      </section>
    </FeaturePageShell>
  );
}
