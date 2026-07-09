import type { PlannedTrack } from '@auracle/shared';
import { useRadioState } from '@/features/radio/session/RadioSessionContext';
import {
  deriveHistoryLiveRows,
  deriveSessionTitle,
  formatSavedAt,
  hasStartedSession,
} from '@/features/radio/session/sessionDisplay';
import type { SessionHistoryEntry, SessionHistoryTrack } from '@/features/radio/session/sessionHistory';
import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
import chrome from '@/app/ProductChrome.module.css';
import styles from './HistoryPage.module.css';

export interface HistoryPageProps {
  history: SessionHistoryEntry[];
  onOpenListen: () => void;
}

export function HistoryPage({ history, onOpenListen }: HistoryPageProps) {
  const state = useRadioState();
  const hasSession = hasStartedSession(state);
  const latestSession = history[0];
  const sessionHeading = deriveSessionTitle(hasSession, state, latestSession);
  const liveRows = deriveHistoryLiveRows(hasSession, state);
  const trackHistory = latestSession?.tracks ?? (hasSession ? state.sessionTracklist : []);
  const savedCountLabel = history.length === 1 ? '1 saved session' : `${history.length} saved sessions`;

  return (
    <main className={`${chrome.productSurface} ${chrome.pageTransition}`}>
      <section className={styles.pageIntro} aria-labelledby="history-title">
        <p className={chrome.kicker}>History</p>
        <h1 id="history-title">Your saved radio rooms.</h1>
        <p>
          Review the sessions Auracle has finished on this device, then jump back into a fresh room when you are ready.
        </p>
        <button className={chrome.primaryButton} type="button" onClick={onOpenListen}>
          Start New Session
        </button>
      </section>

      <section className={styles.historySummary} aria-label="History summary">
        <span>
          <strong>{history.length > 0 ? savedCountLabel : 'No saved sessions yet'}</strong>
          <small>Saved locally for this listener</small>
        </span>
        <span>
          <strong>
            {latestSession ? formatTime(latestSession.durationSec) : hasSession ? formatTime(state.sessionElapsedSec) : '0:00'}
          </strong>
          <small>{latestSession ? 'Latest saved duration' : hasSession ? 'Current session time' : 'Waiting for first session'}</small>
        </span>
        <span>
          <strong>{trackHistory.length > 0 ? trackHistory.length : 'Ready'}</strong>
          <small>{trackHistory.length > 0 ? 'Tracks in the latest path' : 'Tracks appear after planning'}</small>
        </span>
      </section>

      <section className={styles.historyLayout} aria-label="Listening history">
        <article className={`${styles.historyPanel} ${styles.sessionPanel}`}>
          <div className={styles.sectionHeading}>
            <p className={chrome.kicker}>Sessions</p>
            <h2>{sessionHeading}</h2>
          </div>
          {history.length > 0 ? (
            <div className={styles.sessionRows}>
              {history.slice(0, 6).map((session, index) => (
                <HistorySessionRow key={`${session.id}-${session.savedAt}`} session={session} index={index} />
              ))}
            </div>
          ) : hasSession ? (
            <div className={styles.sessionRows}>
              {liveRows.map((row) => (
                <span key={row.strong}>
                  <small>Live</small>
                  <strong>{row.strong}</strong>
                  <em>{row.detail}</em>
                </span>
              ))}
            </div>
          ) : (
            <p className={chrome.emptyText}>Start and finish a session, then it will appear here.</p>
          )}
        </article>

        <article className={`${styles.historyPanel} ${styles.trackHistoryPanel}`}>
          <div className={styles.sectionHeading}>
            <p className={chrome.kicker}>Track path</p>
            <h2>{trackHistory.length > 0 ? 'Latest listening path' : 'Waiting for a flow'}</h2>
          </div>
          {trackHistory.length > 0 ? (
            <div className={styles.trackHistory}>
              {trackHistory.slice(0, 6).map((track, index) => (
                <HistoryTrackRow key={`${track.id}-${index}`} track={track} index={index} />
              ))}
            </div>
          ) : (
            <p className={chrome.emptyText}>The listening path appears after session planning.</p>
          )}
        </article>
      </section>
    </main>
  );
}

function HistorySessionRow({ session, index }: { session: SessionHistoryEntry; index: number }) {
  return (
    <span>
      <small>{String(index + 1).padStart(2, '0')}</small>
      <strong>{session.title}</strong>
      <em>
        {formatSavedAt(session.savedAt)} - {formatTime(session.durationSec)} - {session.trackCount} tracks
      </em>
    </span>
  );
}

function HistoryTrackRow({ track, index }: { track: PlannedTrack | SessionHistoryTrack; index: number }) {
  const meta = useTrackMeta(track.id);
  const title = 'title' in track ? track.title : meta.title;
  const artist = 'artist' in track ? track.artist : meta.artist;

  return (
    <span>
      <small>{String(index + 1).padStart(2, '0')}</small>
      <strong>{title}</strong>
      <em>{artist}</em>
    </span>
  );
}
