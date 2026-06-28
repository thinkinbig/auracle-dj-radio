import { useEffect, useState } from 'react';
import { RadioSessionProvider, useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { getAppView } from '@/features/radio/session/playbackSelectors';
import type { PlaybackState } from '@/features/radio/session/types';
import { loadTrackCatalog } from '@/data/trackCatalog';
import { AppBrand } from '@/features/marketing/AppBrand';
import { AuthStatus } from '@/features/marketing/AuthStatus';
import { LandingPage } from '@/features/marketing/LandingPage';
import { logout, restoreUser } from '@/features/marketing/authApi';
import { ImportPlaylistScreen } from '@/features/playlist-import/ImportPlaylistScreen';
import { MoodPickerScreen } from '@/features/radio/ui/MoodPickerScreen';
import { PlayerScreen } from '@/features/radio/ui/PlayerScreen';
import { SoundScreen } from '@/features/sound/SoundScreen';
import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
import { IconArrowRight, IconPlay } from '@/shared/ui/Icons';
import type { AuthUser, FlowTrackRef } from '@auracle/shared';
import styles from './AppNav.module.css';

type ProductPage = 'home' | 'listen' | 'import' | 'sound' | 'history';

const PRODUCT_NAV: { id: ProductPage; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'listen', label: 'Listen' },
  { id: 'import', label: 'Library' },
  { id: 'sound', label: 'Taste' },
  { id: 'history', label: 'History' },
];

const HOME_DNA = ['Reflective', 'Late Night', 'Curious'] as const;

function AppContent({ user }: { user: AuthUser }) {
  const state = useRadioState();
  const { handleTogglePause, handleSkipTrack } = useRadioActions();
  const appView = getAppView(state.phase);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (state.phase === 'idle') return;
        handleTogglePause();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyN') {
        e.preventDefault();
        handleSkipTrack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, handleTogglePause, handleSkipTrack]);

  if (appView === 'mood_picking') return <MoodPickerScreen user={user} />;

  return <PlayerScreen />;
}

function LoggedInApp({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [activePage, setActivePage] = useState<ProductPage>('home');
  const state = useRadioState();
  const { handleReturnToSetup } = useRadioActions();
  const hasSession = hasStartedSession(state);

  function openListen() {
    setActivePage('listen');
  }

  function startNewSession() {
    if (hasSession) handleReturnToSetup();
    setActivePage('listen');
  }

  function renderPage() {
    if (activePage === 'listen') {
      return <AppContent user={user} />;
    }

    if (activePage === 'import') {
      return (
        <main className={`${styles.productSurface} ${styles.featureSurface} ${styles.pageTransition}`}>
          <ImportPlaylistScreen user={user} onClose={() => setActivePage('home')} embedded />
        </main>
      );
    }

    if (activePage === 'sound') {
      return (
        <main className={`${styles.productSurface} ${styles.featureSurface} ${styles.pageTransition}`}>
          <SoundScreen
            user={user}
            onClose={() => setActivePage('home')}
            onOpenImport={() => setActivePage('import')}
            embedded
          />
        </main>
      );
    }

    if (activePage === 'history') {
      return <HistoryPage onOpenListen={openListen} />;
    }

    return (
      <HomePage
        user={user}
        onContinue={openListen}
        onStartNew={startNewSession}
        onOpenSound={() => setActivePage('sound')}
        onOpenImport={() => setActivePage('import')}
        onOpenHistory={() => setActivePage('history')}
      />
    );
  }

  return (
    <>
      <AppBrand onClick={() => setActivePage('home')} label="Home" />
      <nav className={styles.appNav} aria-label="Primary">
        {PRODUCT_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activePage === item.id ? styles.active : undefined}
            aria-current={activePage === item.id ? 'page' : undefined}
            onClick={() => setActivePage(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <AuthStatus
        user={user}
        onLogout={onLogout}
        onOpenListen={openListen}
        playback={state}
      />
      {renderPage()}
    </>
  );
}

function HomePage({
  user,
  onContinue,
  onStartNew,
  onOpenSound,
  onOpenImport,
  onOpenHistory,
}: {
  user: AuthUser;
  onContinue: () => void;
  onStartNew: () => void;
  onOpenSound: () => void;
  onOpenImport: () => void;
  onOpenHistory: () => void;
}) {
  const state = useRadioState();
  const hasSession = hasStartedSession(state);
  const firstName = user.name.split(/\s+/).filter(Boolean)[0] ?? 'there';
  const sessionTitle = hasSession ? state.sessionTitle : 'No sessions yet';
  const sessionDuration = state.sessionElapsedSec > 0 ? formatTime(state.sessionElapsedSec) : 'Just started';
  const sessionTimeline = hasSession
    ? [
        { title: state.trackTitle, detail: state.sessionSubtitle || 'Now playing' },
        { title: 'Midnight Pulse', detail: 'Late Night' },
        { title: 'Fade Into Stars', detail: 'Curious' },
      ]
    : [
        { title: 'Choose a mood', detail: 'Start with one signal' },
        { title: 'Build your flow', detail: 'Auracle shapes the station' },
        { title: 'Save the story', detail: 'Sessions appear in History' },
      ];
  const generatedSessions = hasSession
    ? [
        {
          title: state.sessionTitle,
          detail: state.sessionSubtitle || 'Current station',
          status: state.phase === 'playing' ? 'Playing now' : 'Current session',
        },
      ]
    : [];
  const libraryTrackCount = state.sessionTracklist.length;

  return (
    <main className={`${styles.productSurface} ${styles.homeSurface} ${styles.pageTransition}`}>
      <section className={styles.homeHero} aria-labelledby="home-title">
        <div className={styles.homeCopy}>
          <h1 id="home-title">Welcome back, {firstName}.</h1>
          <p className={styles.homeSignal}>Your music, your moment.</p>
          <p className={styles.homeLede}>Start a station from your mood, memory, and taste.</p>
          <div className={styles.homeActions}>
            <button className={styles.primaryButton} type="button" onClick={onStartNew}>
              <IconPlay size={18} />
              Start New Session
            </button>
          </div>
        </div>

        <aside className={styles.sessionPreview} aria-label="Last session">
          <div className={styles.sessionPreviewHeader}>
            <div className={styles.sessionPreviewCopy}>
              <span className={styles.previewLabel}>{hasSession ? 'Recent Session' : 'Empty Session'}</span>
              <h2>{sessionTitle}</h2>
              <p className={styles.sessionSubline}>
                {hasSession ? `Current session · ${sessionDuration}` : 'Start your first station to create a listening path.'}
              </p>
            </div>
            <div className={styles.sessionArtwork} aria-hidden>
              <span />
            </div>
          </div>

          <div className={styles.sessionPath} aria-label={hasSession ? 'Session path' : 'First session steps'}>
            {sessionTimeline.map((item) => (
              <span key={`${item.title}-${item.detail}`}>
                <i aria-hidden />
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
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
            <p className={styles.kicker}>Your Taste DNA</p>
            <h2>Signals at a glance.</h2>
          </div>
          <div className={styles.tasteGraphWrap} aria-label="Taste DNA overview">
            <div className={styles.tasteLegend}>
              {HOME_DNA.map((item) => (
                <span key={item}>
                  <i aria-hidden />
                  <strong>{item}</strong>
                  <small />
                </span>
              ))}
            </div>
          </div>
          <button className={styles.textButton} type="button" onClick={onOpenSound}>
            Edit My Sound
            <IconArrowRight size={18} />
          </button>
        </article>

        <article className={`${styles.homeShortcutCard} ${styles.libraryCard}`}>
          <div className={styles.cardHeading}>
            <p className={styles.kicker}>Music Library</p>
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
          <button className={styles.textButton} type="button" onClick={onOpenImport}>
            Manage Library
            <IconArrowRight size={18} />
          </button>
        </article>

        <article className={`${styles.homeShortcutCard} ${styles.historyShortcutCard}`}>
          <div className={styles.cardHeading}>
            <p className={styles.kicker}>Session History</p>
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
            <p className={styles.emptyText}>Generated sessions will collect here after you start listening.</p>
          )}
          <button className={styles.textButton} type="button" onClick={onOpenHistory}>
            View History
            <IconArrowRight size={18} />
          </button>
        </article>
      </section>
    </main>
  );
}

function HistoryPage({ onOpenListen }: { onOpenListen: () => void }) {
  const state = useRadioState();
  const hasSession = hasStartedSession(state);
  const recentTranscript = state.transcript.slice(-3);

  return (
    <main className={`${styles.productSurface} ${styles.pageTransition}`}>
      <section className={styles.pageIntro} aria-labelledby="history-title">
        <p className={styles.kicker}>History</p>
        <h1 id="history-title">Listening memories, without the clutter.</h1>
        <p>
          A calm record of sessions, saved moments, and the small preferences Auracle can carry into
          the next radio flow.
        </p>
        <button className={styles.primaryButton} type="button" onClick={onOpenListen}>
          Open Listen
        </button>
      </section>

      <section className={styles.historyLayout} aria-label="Listening history">
        <article className={styles.historyPanel}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Sessions</p>
            <h2>{hasSession ? state.sessionTitle : 'No saved sessions yet'}</h2>
          </div>
          {hasSession ? (
            <div className={styles.sessionRows}>
              <span>
                <strong>{state.sessionSubtitle}</strong>
                Current session · {formatTime(state.sessionElapsedSec)}
              </span>
              <span>
                <strong>{state.trackTitle}</strong>
                Now playing · {state.artist}
              </span>
            </div>
          ) : (
            <p className={styles.emptyText}>Start a session and it will appear here.</p>
          )}
        </article>

        <article className={styles.historyPanel}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Favorites</p>
            <h2>{state.playlistFeedback === 'like' ? state.trackTitle : 'No favorites yet'}</h2>
          </div>
          <p className={styles.emptyText}>
            {state.playlistFeedback === 'like'
              ? `${state.artist} is marked as the current favorite signal.`
              : 'Liked tracks will become taste signals for future sessions.'}
          </p>
        </article>

        <article className={`${styles.historyPanel} ${styles.memoryPanel}`}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Listening Memories</p>
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
            <p className={styles.emptyText}>Talk to the DJ during a session to create memories.</p>
          )}
        </article>

        <article className={`${styles.historyPanel} ${styles.trackHistoryPanel}`}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Track path</p>
            <h2>{hasSession ? `${state.sessionTracklist.length} planned tracks` : 'Waiting for a flow'}</h2>
          </div>
          {hasSession ? (
            <div className={styles.trackHistory}>
              {state.sessionTracklist.slice(0, 6).map((track, index) => (
                <HistoryTrackRow key={`${track.id}-${index}`} track={track} index={index} />
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>The listening path appears after session planning.</p>
          )}
        </article>
      </section>
    </main>
  );
}

function HistoryTrackRow({ track, index }: { track: FlowTrackRef; index: number }) {
  const meta = useTrackMeta(track.id);

  return (
    <span>
      <small>{String(index + 1).padStart(2, '0')}</small>
      <strong>{meta.title}</strong>
      <em>{meta.artist}</em>
    </span>
  );
}

function hasStartedSession(state: PlaybackState): boolean {
  return state.phase !== 'idle' || state.sessionId !== null;
}

export default function App() {
  const [user, setUser] = useState<AuthUser | undefined>();
  const [isRestoringUser, setIsRestoringUser] = useState(true);

  useEffect(() => {
    let cancelled = false;
    restoreUser().then((restoredUser) => {
      if (cancelled) return;
      setUser(restoredUser);
      setIsRestoringUser(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadTrackCatalog();
  }, []);

  if (isRestoringUser) {
    return null;
  }

  if (!user) {
    return <LandingPage onEnterApp={setUser} />;
  }

  return (
    <RadioSessionProvider onAuthExpired={() => setUser(undefined)}>
      <LoggedInApp
        user={user}
        onLogout={() => {
          void logout();
          setUser(undefined);
        }}
      />
    </RadioSessionProvider>
  );
}
