import { useAuth } from '@/features/marketing/AuthProvider';
import { isGuestUser } from '@/features/marketing/guest';
import { SpotifyTasteSummaryPanel } from '@/features/spotify/SpotifyTasteSummaryPanel';
import { FeaturePageShell } from '@/shared/ui/FeaturePageShell';
import { cn } from '@/shared/lib/cn';
import styles from './SoundScreen.module.css';

interface SoundScreenProps {
  onGuestBack: () => void;
}

export function SoundScreen({ onGuestBack }: SoundScreenProps) {
  const { user } = useAuth();
  const isGuest = isGuestUser(user!);

  return (
    <FeaturePageShell
      pageClassName={cn(styles.page, isGuest && styles.guestPage)}
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
      {isGuest ? (
        <section className={styles.guestGate} aria-live="polite">
          <div>
            <p className={styles.kicker}>Login required</p>
            <h2>Build a profile that follows you.</h2>
            <p>
              Guest mode plays a demo station. Sign in to view Spotify-derived taste signals.
            </p>
          </div>
          <button className={styles.backToDemo} type="button" onClick={onGuestBack}>
            Back to demo
          </button>
        </section>
      ) : (
        <section className={styles.profileSection} aria-label="Spotify taste dashboard">
          <SpotifyTasteSummaryPanel />
        </section>
      )}
    </FeaturePageShell>
  );
}
