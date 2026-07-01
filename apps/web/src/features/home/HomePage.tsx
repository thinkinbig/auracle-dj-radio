import { useAuth } from '@/features/marketing/AuthProvider';
import { firstNameFromUser } from '@/features/marketing/guest';
import { useRadioState } from '@/features/radio/session/RadioSessionContext';
import {
  deriveGeneratedSessions,
  deriveSessionDurationLabel,
  deriveSessionTitle,
  formatSavedAt,
  hasStartedSession,
} from '@/features/radio/session/sessionDisplay';
import type { SessionHistoryEntry } from '@/features/radio/session/sessionHistory';
import { resolveProfileTasteWords, resolveTasteWords } from '@/features/sound/tasteDisplay';
import { useTasteQuery } from '@/features/sound/useTasteQuery';
import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { IconArrowRight, IconPlay } from '@/shared/ui/icons';
import chrome from '@/app/ProductChrome.module.css';
import styles from './HomePage.module.css';

export interface HomePageProps {
  history: SessionHistoryEntry[];
  onContinue: () => void;
  onStartNew: () => void;
  onOpenSound: () => void;
  onOpenImport: () => void;
  onOpenHistory: () => void;
}

export function HomePage({
  history,
  onContinue,
  onStartNew,
  onOpenSound,
  onOpenImport,
  onOpenHistory,
}: HomePageProps) {
  const { user } = useAuth();
  if (!user) return null;
  const state = useRadioState();
  const tasteQuery = useTasteQuery();
  const hasSession = hasStartedSession(state);
  const latestSavedSession = history[0];
  const firstName = firstNameFromUser(user);
  const sessionTitle = deriveSessionTitle(hasSession, state, latestSavedSession);
  const sessionDuration = deriveSessionDurationLabel(hasSession, state, latestSavedSession);
  const generatedSessions = deriveGeneratedSessions(hasSession, state, history);
  const tasteWords = resolveProfileTasteWords(
    user,
    tasteQuery.data ? resolveTasteWords(tasteQuery.data.preferences) : [],
    tasteQuery,
  );
  const libraryTrackCount = state.sessionTracklist.length;
  const previewArtworkTrackId = hasSession ? state.trackId : latestSavedSession?.tracks[0]?.id ?? '';
  const previewArtwork = useTrackMeta(previewArtworkTrackId);
  const previewArtworkUrl = previewArtwork.albumCoverUrl || previewArtwork.artistPhotoUrl;
  const previewArtworkAlt = previewArtwork.albumCoverUrl
    ? `${previewArtwork.albumTitle || previewArtwork.title} cover`
    : previewArtwork.artistPhotoUrl
      ? `${previewArtwork.artist} image`
      : '';
  const remainingTracks = Math.max(state.sessionTracklist.length - state.currentTrackIndex, 0);
  const sessionOverview = hasSession
    ? [
        { label: 'Mode', value: state.sessionSubtitle || 'Live flow' },
        { label: 'Elapsed', value: sessionDuration },
        { label: 'Queue', value: remainingTracks === 1 ? '1 track' : `${remainingTracks} tracks` },
      ]
    : latestSavedSession
      ? [
          { label: 'Saved', value: formatSavedAt(latestSavedSession.savedAt) },
          { label: 'Length', value: sessionDuration },
          {
            label: 'Flow',
            value: latestSavedSession.trackCount === 1 ? '1 track' : `${latestSavedSession.trackCount} tracks`,
          },
        ]
      : [
          { label: 'Start', value: 'Mood first' },
          { label: 'Taste', value: tasteWords[0] ?? 'Learning' },
          { label: 'Library', value: libraryTrackCount > 0 ? `${libraryTrackCount} ready` : 'Ready' },
        ];

  return (
    <main className={`${chrome.productSurface} ${chrome.homeSurface} ${chrome.pageTransition}`}>
      <section className={styles.homeHero} aria-labelledby="home-title">
        <div className={styles.homeCopy}>
          <h1 id="home-title">Welcome back, {firstName}.</h1>
          <p className={styles.homeSignal}>Your music, your moment.</p>
          <p className={styles.homeLede}>Start a station from your mood, memory, and taste.</p>
          <div className={styles.homeActions}>
            <button className={chrome.primaryButton} type="button" onClick={onStartNew}>
              <IconPlay size={18} />
              Start New Session
            </button>
          </div>
        </div>

        <aside className={styles.sessionPreview} aria-label="Last session">
          <div className={styles.sessionPreviewHeader}>
            <div className={styles.sessionPreviewCopy}>
              <span className={styles.previewLabel}>
                {hasSession ? 'Recent Session' : latestSavedSession ? 'Saved Session' : 'Empty Session'}
              </span>
              <h2>{sessionTitle}</h2>
              <p className={styles.sessionSubline}>
                {hasSession
                  ? `Current session · ${sessionDuration}`
                  : latestSavedSession
                    ? `Saved session · ${sessionDuration}`
                    : 'Start your first station to create a listening path.'}
              </p>
            </div>
            <div
              className={`${styles.sessionArtwork} ${previewArtworkUrl ? styles.sessionArtworkWithImage : ''}`}
              aria-hidden={!previewArtworkUrl}
            >
              {previewArtworkUrl ? (
                <img src={previewArtworkUrl} alt={previewArtworkAlt} width={174} height={174} loading="lazy" />
              ) : (
                <span />
              )}
            </div>
          </div>

          <div className={styles.sessionOverview} aria-label="Session overview">
            {sessionOverview.map((item) => (
              <span className={styles.sessionMetric} key={`${item.label}-${item.value}`}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>

          <button className={styles.sessionContinueButton} type="button" onClick={hasSession ? onContinue : onStartNew}>
            {hasSession ? 'Continue Session' : 'Start First Session'}
            <IconArrowRight size={22} />
          </button>
        </aside>
      </section>

      <section className={styles.homeCardGrid} aria-label="Home shortcuts">
        <article className={`${styles.homeShortcutCard} ${styles.tasteGraphCard}`}>
          <div className={styles.cardHeading}>
            <p className={chrome.kicker}>Your Taste DNA</p>
            <h2>Signals at a glance.</h2>
          </div>
          <div className={styles.tasteGraphWrap} aria-label="Taste DNA overview">
            <div className={styles.tasteLegend}>
              {tasteWords.map((item) => (
                <span key={item}>
                  <i aria-hidden />
                  <strong>{item}</strong>
                  <small />
                </span>
              ))}
            </div>
          </div>
          <button className={chrome.textButton} type="button" onClick={onOpenSound}>
            Edit My Sound
            <IconArrowRight size={18} />
          </button>
        </article>

        <article className={`${styles.homeShortcutCard} ${styles.libraryCard}`}>
          <div className={styles.cardHeading}>
            <p className={chrome.kicker}>Music Library</p>
            <h2>Your source material.</h2>
          </div>
          <div className={styles.libraryStack} aria-label="Library summary">
            <span>
              <strong>{libraryTrackCount > 0 ? libraryTrackCount : 'Ready'}</strong>
              <small>{libraryTrackCount > 0 ? 'planned tracks in this flow' : 'to import playlists'}</small>
            </span>
            <span>
              <strong>Artists</strong>
              <small>Shape future radio sessions</small>
            </span>
          </div>
          <button className={chrome.textButton} type="button" onClick={onOpenImport}>
            Manage Library
            <IconArrowRight size={18} />
          </button>
        </article>

        <article className={`${styles.homeShortcutCard} ${styles.historyShortcutCard}`}>
          <div className={styles.cardHeading}>
            <p className={chrome.kicker}>Session History</p>
            <h2>Every station you create.</h2>
          </div>
          {generatedSessions.length > 0 ? (
            <div className={styles.generatedSessionList} aria-label="Generated sessions">
              {generatedSessions.map((session) => (
                <button key={session.title} type="button" onClick={onOpenHistory}>
                  <span>
                    <strong>{session.title}</strong>
                    <small>{session.detail}</small>
                  </span>
                  <em>{session.status}</em>
                </button>
              ))}
            </div>
          ) : (
            <p className={chrome.emptyText}>Generated sessions will collect here after you start listening.</p>
          )}
          <button className={chrome.textButton} type="button" onClick={onOpenHistory}>
            View History
            <IconArrowRight size={18} />
          </button>
        </article>
      </section>
    </main>
  );
}
