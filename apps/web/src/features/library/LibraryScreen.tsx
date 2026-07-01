import { useState } from 'react';
import { SpotifyPlaybackControl } from '@/features/spotify/SpotifyPlaybackControl';
import { CatalogArchivePanel } from '@/features/sound/CatalogArchivePanel';
import { FeaturePageShell } from '@/shared/ui/FeaturePageShell';
import enter from '@/shared/ui/FeatureEnter.module.css';
import { cn } from '@/shared/lib/cn';
import styles from './LibraryScreen.module.css';

export function LibraryScreen() {
  const [catalogTrackCount, setCatalogTrackCount] = useState<number | null>(null);

  return (
    <FeaturePageShell
      pageClassName={styles.page}
      headerClassName={styles.header}
      mainClassName={styles.main}
      hero={
        <div className={styles.heroGrid}>
          <section className={styles.heroCopy} aria-labelledby="library-title">
            <h1 id="library-title" className={cn(enter.enter, enter.d90)}>Your music library.</h1>
            <p className={cn(enter.enter, enter.d180)}>
              Browse the Auracle catalog, or connect Spotify so stations can draw from liked tracks.
            </p>
          </section>
          <div className={cn(styles.catalogCard, enter.enter, enter.d280)} aria-hidden>
            <span>Local catalog</span>
            <strong>{catalogTrackCount != null ? catalogTrackCount : 'Ready'}</strong>
            <small>{catalogTrackCount != null ? 'tracks on device' : 'catalog loading'}</small>
          </div>
        </div>
      }
    >
      <section className={cn(styles.sourcePanel, enter.enter, enter.d360)} aria-labelledby="library-source-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Source</p>
            <h2 id="library-source-title">Playback source</h2>
          </div>
          <span className={styles.countBadge}>Spotify</span>
        </div>
        <SpotifyPlaybackControl />
      </section>

      <section className={cn(styles.catalogPanel, enter.enter, enter.d440)} aria-labelledby="library-catalog-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Browse</p>
            <h2 id="library-catalog-title">Auracle catalog</h2>
          </div>
          <span className={styles.countBadge}>On device</span>
        </div>
        <CatalogArchivePanel tone="library" onTrackCount={setCatalogTrackCount} />
      </section>
    </FeaturePageShell>
  );
}
