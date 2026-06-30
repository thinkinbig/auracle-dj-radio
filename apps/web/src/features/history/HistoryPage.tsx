import type { FlowTrackRef } from '@auracle/shared';
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
  const recentTranscript = latestSession?.transcript.slice(-3) ?? state.transcript.slice(-3);
  const trackHistory = latestSession?.tracks ?? state.sessionTracklist;
  const favoriteSession = history.find((session) => session.playlistFeedback === 'like');

  return (
    <main className={`${chrome.productSurface} ${chrome.pageTransition}`}>
      <section className={styles.pageIntro} aria-labelledby="history-title">
        <h1 id="history-title">Listening memories, without the clutter.</h1>
        <p>
          A calm record of sessions, saved moments, and the small preferences Auracle can carry into the next radio
          flow.
        </p>
        <button className={chrome.primaryButton} type="button" onClick={onOpenListen}>
          Open Listen
        </button>
      </section>

      <section className={styles.historyLayout} aria-label="Listening history">
        <article className={styles.historyPanel}>
          <div className={styles.sectionHeading}>
            <p className={chrome.kicker}>Sessions</p>
            <h2>{sessionHeading}</h2>
          </div>
          {history.length > 0 ? (
            <div className={styles.sessionRows}>
              {history.slice(0, 5).map((session) => (
                <span key={`${session.id}-${session.savedAt}`}>
                  <strong>{session.title}</strong>
                  {formatSavedAt(session.savedAt)} · {formatTime(session.durationSec)} · {session.trackCount} tracks
                </span>
              ))}
            </div>
          ) : hasSession ? (
            <div className={styles.sessionRows}>
              {liveRows.map((row) => (
                <span key={row.strong}>
                  <strong>{row.strong}</strong>
                  {row.detail}
                </span>
              ))}
            </div>
          ) : (
            <p className={chrome.emptyText}>Start and finish a session, then it will appear here.</p>
          )}
        </article>

        <article className={styles.historyPanel}>
          <div className={styles.sectionHeading}>
            <p className={chrome.kicker}>Favorites</p>
            <h2>
              {favoriteSession
                ? favoriteSession.title
                : state.playlistFeedback === 'like'
                  ? state.trackTitle
                  : 'No favorites yet'}
            </h2>
          </div>
          <p className={chrome.emptyText}>
            {favoriteSession
              ? `${favoriteSession.title} was saved as a liked session signal.`
              : state.playlistFeedback === 'like'
                ? `${state.artist} is marked as the current favorite signal.`
                : 'Liked tracks will become taste signals for future sessions.'}
          </p>
        </article>

        <article className={`${styles.historyPanel} ${styles.memoryPanel}`}>
          <div className={styles.sectionHeading}>
            <p className={chrome.kicker}>Listening Memories</p>
            <h2>{recentTranscript.length > 0 ? 'Recent conversation' : 'No memories yet'}</h2>
          </div>
          {recentTranscript.length > 0 ? (
            <div className={styles.memoryList}>
              {recentTranscript.map((line) => (
                <span key={line.id}>
                  <strong>{line.role === 'user' ? 'You' : 'Auracle'}</strong>
                  {line.text}
                </span>
              ))}
            </div>
          ) : (
            <p className={chrome.emptyText}>Talk to the DJ during a session to create memories.</p>
          )}
        </article>

        <article className={`${styles.historyPanel} ${styles.trackHistoryPanel}`}>
          <div className={styles.sectionHeading}>
            <p className={chrome.kicker}>Track path</p>
            <h2>{trackHistory.length > 0 ? `${trackHistory.length} planned tracks` : 'Waiting for a flow'}</h2>
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

function HistoryTrackRow({ track, index }: { track: FlowTrackRef | SessionHistoryTrack; index: number }) {
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
