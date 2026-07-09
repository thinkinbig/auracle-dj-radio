import { useState } from 'react';
import { useAuth } from '@/features/marketing/AuthProvider';
import { isSpotifyUser } from '@/features/marketing/guest';
import { CatalogArchivePanel } from '@/features/sound/CatalogArchivePanel';
import { FeaturePageShell } from '@/shared/ui/FeaturePageShell';
import enter from '@/shared/ui/FeatureEnter.module.css';
import { cn } from '@/shared/lib/cn';
import styles from './LibraryScreen.module.css';

export function LibraryScreen() {
  const { user } = useAuth();
  const hasSpotifyPlayback = isSpotifyUser(user!);
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
              {hasSpotifyPlayback
                ? 'Spotify is connected for your next radio session. The local catalog stays here for browsing and fallback.'
                : 'Browse the Auracle catalog for your next radio session.'}
            </p>
            <div className={cn(styles.heroSignals, enter.enter, enter.d280)} aria-label="Library capabilities">
              <span>Local previews</span>
              {hasSpotifyPlayback ? <span>Spotify connected</span> : <span>Local mode</span>}
              <span>Session ready</span>
            </div>
          </section>
          <div className={cn(styles.catalogCard, enter.enter, enter.d280)} aria-hidden>
            <div className={styles.catalogCardTop}>
              <span>Local catalog</span>
              <small>{catalogTrackCount != null ? 'tracks on device' : 'catalog loading'}</small>
            </div>
            <strong>{catalogTrackCount != null ? catalogTrackCount : 'Ready'}</strong>
            <div className={styles.catalogCardMeter}>
              <i />
              <i />
              <i />
            </div>
          </div>
        </div>
      }
    >
      <section className={cn(styles.catalogPanel, enter.enter, enter.d360)} aria-labelledby="library-catalog-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Browse</p>
            <h2 id="library-catalog-title">Auracle catalog</h2>
            <p className={styles.panelCopy}>
              Preview artists, albums, and track lore before a station pulls them into rotation.
            </p>
          </div>
          <span className={styles.countBadge}>{catalogTrackCount != null ? `${catalogTrackCount} tracks` : 'On device'}</span>
        </div>
        <CatalogArchivePanel tone="library" onTrackCount={setCatalogTrackCount} />
      </section>
    </FeaturePageShell>
  );
}
