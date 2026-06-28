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

function AppContent() {
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

  if (appView === 'mood_picking') return <MoodPickerScreen />;

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
      return <AppContent />;
    }

    if (activePage === 'import') {
      return (
        <main className={`${styles.productSurface} ${styles.featureSurface}`}>
          <ImportPlaylistScreen user={user} onClose={() => setActivePage('home')} embedded />
        </main>
      );
    }

    if (activePage === 'sound') {
      return (
        <main className={`${styles.productSurface} ${styles.featureSurface}`}>
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
}: {
  user: AuthUser;
  onContinue: () => void;
  onStartNew: () => void;
  onOpenSound: () => void;
}) {
  const state = useRadioState();
  const hasSession = hasStartedSession(state);
  const firstName = user.name.split(/\s+/).filter(Boolean)[0] ?? 'there';
  const trackCount = state.sessionTracklist.length || 8;
  const completedTracks = hasSession ? Math.min(state.currentTrackIndex + 1, trackCount) : 0;

  return (
    <main className={styles.productSurface}>
      <section className={styles.homeHero} aria-labelledby="home-title">
        <div className={styles.homeCopy}>
          <p className={styles.kicker}>Home</p>
          <h1 id="home-title">Welcome back, {firstName}.</h1>
          <p>
            Your radio starts from one quiet place: the last session, a fresh moment, and the Taste DNA
            that keeps shaping what Auracle plays.
          </p>
          <div className={styles.homeActions}>
            <button className={styles.primaryButton} type="button" onClick={hasSession ? onContinue : onStartNew}>
              {hasSession ? 'Continue Session' : 'Start New Session'}
            </button>
            {hasSession ? (
              <button className={styles.secondaryButton} type="button" onClick={onStartNew}>
                Start New Session
              </button>
            ) : null}
          </div>
        </div>

        <aside className={styles.sessionPreview} aria-label="Last session">
          <span className={styles.previewLabel}>{hasSession ? 'Last session' : 'Ready to begin'}</span>
          <h2>{hasSession ? state.sessionTitle : 'No active session yet'}</h2>
          <p>{hasSession ? state.sessionSubtitle : 'Choose a mood and Auracle will build the first flow.'}</p>
          <div className={styles.sessionMeter} aria-label={`${completedTracks} of ${trackCount} tracks`}>
            <span style={{ width: `${hasSession ? Math.max(12, (completedTracks / trackCount) * 100) : 0}%` }} />
          </div>
          <small>
            {hasSession
              ? `${completedTracks}/${trackCount} tracks · ${formatTime(state.sessionElapsedSec)}`
              : 'Taste-aware session planning'}
          </small>
        </aside>
      </section>

      <section className={styles.homeGrid} aria-label="Home overview">
        <article className={styles.dnaPanel}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Taste DNA</p>
            <h2>Quiet signals, ready for every session.</h2>
          </div>
          <div className={styles.dnaWords} aria-label="Taste DNA overview">
            <span>Reflective focus</span>
            <span>Night drive pulse</span>
            <span>Warm nostalgia</span>
            <span>Curious discoveries</span>
          </div>
          <button className={styles.textButton} type="button" onClick={onOpenSound}>
            Edit My Sound
          </button>
        </article>

        <article className={styles.homeListPanel}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Now tuned</p>
            <h2>{hasSession ? state.trackTitle : 'A clean first session'}</h2>
          </div>
          <div className={styles.softRows}>
            <span>
              <strong>{hasSession ? state.artist : 'Mood'}</strong>
              {hasSession ? state.albumTitle : 'Picked when you start'}
            </span>
            <span>
              <strong>DJ memory</strong>
              {user.id === 'guest' ? 'Guest preview mode' : 'Saved to your account'}
            </span>
            <span>
              <strong>Session shape</strong>
              {hasSession ? state.phase : 'Idle'}
            </span>
          </div>
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
    <main className={styles.productSurface}>
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
