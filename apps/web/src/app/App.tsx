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
import { IconArrowRight, IconClock, IconPlay } from '@/shared/ui/Icons';
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

const HOME_DNA = [
  { label: 'Reflective', value: 72 },
  { label: 'Late Night', value: 63 },
  { label: 'Warm Nostalgia', value: 54 },
  { label: 'Curious', value: 48 },
] as const;

const HOME_CONTEXT = [
  { label: 'Taste DNA', detail: 'Your unique music fingerprint', value: 70 },
  { label: "Today's Moment", detail: 'Mood, activity, and time', value: 20 },
  { label: 'Listening Memory', detail: "What you've listened to", value: 10 },
] as const;

const SESSION_WAVEFORM = [
  10, 12, 14, 18, 26, 34, 24, 18, 16, 20, 14, 16, 24, 30, 38, 26, 32, 24, 18, 22, 34, 46, 30, 36,
  28, 18, 22, 40, 26, 34, 18, 16, 22, 44, 30, 24, 20, 26, 34, 42, 28, 22, 16, 20, 26, 30, 18, 16,
  20, 24, 32, 22, 18, 14, 20, 28, 34, 24, 18, 16, 14, 12,
];

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
  onOpenHistory,
}: {
  user: AuthUser;
  onContinue: () => void;
  onStartNew: () => void;
  onOpenSound: () => void;
  onOpenHistory: () => void;
}) {
  const state = useRadioState();
  const hasSession = hasStartedSession(state);
  const firstName = user.name.split(/\s+/).filter(Boolean)[0] ?? 'there';
  const trackCount = state.sessionTracklist.length || 8;
  const completedTracks = hasSession ? Math.min(state.currentTrackIndex + 1, trackCount) : 0;
  const sessionProgress = hasSession ? Math.max(12, (completedTracks / trackCount) * 100) : 0;
  const sessionTags = hasSession
    ? [state.sessionSubtitle || 'Personal flow', formatPhaseName(state.phase), formatHostMode(state.hostMode)]
    : ['Taste DNA', 'Fresh moment', 'Listening memory'];
  const sessionTitle = hasSession ? state.sessionTitle : 'First signal awaits';
  const sessionCopy = hasSession
    ? state.sessionSubtitle
    : 'Choose a mood and Auracle will build the first flow from your taste signals.';
  const durationLabel = hasSession ? formatDurationLabel(state.sessionElapsedSec) : '0 min';
  const lastActiveLabel = hasSession ? 'Active session' : 'No activity yet';
  const sessionAction = hasSession ? 'Continue Session' : 'Start Listening';

  return (
    <main className={`${styles.productSurface} ${styles.homeSurface}`}>
      <section className={styles.homeHero} aria-labelledby="home-title">
        <div className={styles.homeCopy}>
          <p className={styles.kicker}>Personal radio</p>
          <h1 id="home-title">Welcome back, {firstName}.</h1>
          <p className={styles.homeSignal}>Your music, your moment.</p>
          <p className={styles.homeLede}>
            Auracle blends your Taste DNA, listening memory, and today&apos;s moment to create a station that feels just right.
          </p>
          <div className={styles.homeActions}>
            <button className={styles.primaryButton} type="button" onClick={onStartNew}>
              <IconPlay size={18} />
              Start New Session
            </button>
          </div>
          <div className={styles.homeMetaRow}>
            <span>
              <IconClock size={16} />
              Last active: {lastActiveLabel}
            </span>
            <button className={styles.linkButton} type="button" onClick={onOpenHistory}>
              View History
              <IconArrowRight size={18} />
            </button>
          </div>
        </div>

        <aside className={styles.sessionPreview} aria-label="Last session">
          <div className={styles.sessionPreviewTop}>
            <div className={styles.sessionPreviewCopy}>
              <span className={styles.previewLabel}>{hasSession ? 'Last session' : 'Ready to begin'}</span>
              <h2>{sessionTitle}</h2>
              <div className={styles.tagRow} aria-label="Session signals">
                {sessionTags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className={styles.sessionStats}>
                <span>
                  <small>Last played</small>
                  <strong>{hasSession ? 'Current session' : 'Not started'}</strong>
                </span>
                <span>
                  <small>Duration</small>
                  <strong>{durationLabel}</strong>
                </span>
              </div>
            </div>
            <div className={styles.sessionDial} aria-hidden>
              <span />
            </div>
          </div>

          <p className={styles.sessionCopy}>{sessionCopy}</p>
          <div className={styles.previewWaveform} aria-hidden>
            {SESSION_WAVEFORM.map((height, index) => (
              <i key={`${height}-${index}`} style={{ height: `${height}px` }} />
            ))}
          </div>
          <div className={styles.sessionMeter} aria-label={`${completedTracks} of ${trackCount} tracks`}>
            <span style={{ width: `${sessionProgress}%` }} />
          </div>
          <button className={styles.sessionContinueButton} type="button" onClick={hasSession ? onContinue : onStartNew}>
            {sessionAction}
            <IconArrowRight size={22} />
          </button>
        </aside>
      </section>

      <section className={styles.homeGrid} aria-label="Home overview">
        <article className={styles.dnaPanel}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Taste DNA</p>
            <h2>This is what shapes your station.</h2>
          </div>
          <div className={styles.dnaMeterList} aria-label="Taste DNA overview">
            {HOME_DNA.map((item) => (
              <span key={item.label} className={styles.dnaMeterRow}>
                <i className={styles.traitIcon} aria-hidden />
                <strong>{item.label}</strong>
                <span className={styles.dnaMeter}>
                  <i style={{ width: `${item.value}%` }} />
                </span>
                <em>{item.value}%</em>
              </span>
            ))}
          </div>
          <button className={styles.textButton} type="button" onClick={onOpenSound}>
            Edit My Sound
            <IconArrowRight size={18} />
          </button>
        </article>

        <article className={styles.homeListPanel}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Today&apos;s context</p>
            <h2>Here&apos;s how we&apos;ll build your station.</h2>
          </div>
          <div className={styles.contextRows}>
            {HOME_CONTEXT.map((item) => (
              <span key={item.label} className={styles.contextRow}>
                <i className={styles.contextIcon} aria-hidden />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <em>{item.value}%</em>
              </span>
            ))}
          </div>
          <button className={styles.textButton} type="button" onClick={onOpenSound}>
            Learn more about station building
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

function formatDurationLabel(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}

function formatHostMode(mode: PlaybackState['hostMode']): string {
  switch (mode) {
    case 'set_dj':
      return 'Set DJ';
    case 'hype':
      return 'Hype';
    default:
      return 'Curator';
  }
}

function formatPhaseName(phase: PlaybackState['phase']): string {
  switch (phase) {
    case 'curating':
      return 'Tuning';
    case 'opening':
      return 'Opening';
    case 'playing':
      return 'Playing';
    case 'speaking':
      return 'DJ voice';
    case 'listening':
      return 'Listening';
    case 'paused':
      return 'Paused';
    default:
      return 'Ready';
  }
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
