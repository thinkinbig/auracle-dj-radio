import { useCallback, useEffect, useState } from 'react';
import { RadioSessionProvider, useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { getAppView } from '@/features/radio/session/playbackSelectors';
import {
  createSessionHistoryEntry,
  loadSessionHistory,
  saveSessionHistoryEntry,
  type SessionHistoryEntry,
} from '@/features/radio/session/sessionHistory';
import { hasStartedSession } from '@/features/radio/session/sessionDisplay';
import { useTrackCatalogBootstrap } from '@/data/useTrackCatalogQuery';
import { HomePage } from '@/features/home/HomePage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { AppBrand } from '@/features/marketing/AppBrand';
import { AuthStatus } from '@/features/marketing/AuthStatus';
import { useAuth } from '@/features/marketing/AuthProvider';
import { LandingPage } from '@/features/marketing/LandingPage';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { OnboardingPage } from '@/features/radio/ui/OnboardingPage';
import { PlayerScreen } from '@/features/radio/ui/PlayerScreen';
import { SoundScreen } from '@/features/sound/SoundScreen';
import { handleSpotifyRedirect } from '@/features/spotify/spotifyPlayback';
import { paths, PRODUCT_NAV } from './paths';
import navStyles from './AppNav.module.css';
import chrome from './ProductChrome.module.css';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';

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

  if (appView === 'mood_picking') return <OnboardingPage />;

  return <PlayerScreen />;
}

function LoggedInApp() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryEntry[]>(() => loadSessionHistory(user!.id));
  const state = useRadioState();
  const { handleReturnToSetup } = useRadioActions();
  const hasSession = hasStartedSession(state);

  useEffect(() => {
    setSessionHistory(loadSessionHistory(user!.id));
  }, [user]);

  const saveCurrentSession = useCallback(() => {
    const entry = createSessionHistoryEntry(state, user!.id);
    if (!entry) return;
    setSessionHistory(saveSessionHistoryEntry(entry));
  }, [state, user]);

  useEffect(() => {
    if (state.phase !== 'idle' || !state.sessionId) return;
    saveCurrentSession();
  }, [saveCurrentSession, state.phase, state.sessionId]);

  function openListen() {
    navigate(paths.listen);
  }

  function startNewSession() {
    if (hasSession) {
      saveCurrentSession();
      handleReturnToSetup();
    }
    navigate(paths.listen);
  }

  return (
    <>
      <AppBrand onClick={() => navigate(paths.home)} label="Home" />
      <nav className={navStyles.appNav} aria-label="Primary">
        {PRODUCT_NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) => (isActive ? navStyles.active : undefined)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <AuthStatus onLogout={logout} onOpenListen={openListen} playback={state} />
      <Routes>
        <Route
          path={paths.listen}
          element={
            <div className={chrome.listenLayout}>
              <AppContent />
            </div>
          }
        />
        <Route
          path={paths.library}
          element={
            <main className={`${chrome.productSurface} ${chrome.featureSurface} ${chrome.pageTransition}`}>
              <LibraryScreen />
            </main>
          }
        />
        <Route path="/import" element={<Navigate to={paths.library} replace />} />
        <Route
          path={paths.sound}
          element={
            <main className={`${chrome.productSurface} ${chrome.featureSurface} ${chrome.pageTransition}`}>
              <SoundScreen
                onGuestBack={() => navigate(paths.home)}
              />
            </main>
          }
        />
        <Route path={paths.history} element={<HistoryPage history={sessionHistory} onOpenListen={openListen} />} />
        <Route
          path={paths.home}
          element={
            <HomePage
              history={sessionHistory}
              onContinue={openListen}
              onStartNew={startNewSession}
              onOpenSound={() => navigate(paths.sound)}
              onOpenLibrary={() => navigate(paths.library)}
              onOpenHistory={() => navigate(paths.history)}
            />
          }
        />
        <Route path="*" element={<Navigate to={paths.home} replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  const navigate = useNavigate();
  const { user, isRestoringUser, setUser } = useAuth();
  useTrackCatalogBootstrap();

  useEffect(() => {
    const wasSpotifyCallback = window.location.pathname === '/spotify/callback';
    void handleSpotifyRedirect().then(() => {
      if (!wasSpotifyCallback) return;
      const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      navigate(nextPath, { replace: true });
    });
  }, [navigate]);

  if (isRestoringUser) {
    return null;
  }

  if (!user) {
    return <LandingPage onEnterApp={setUser} />;
  }

  return (
    <RadioSessionProvider onAuthExpired={() => setUser(undefined)}>
      <LoggedInApp />
    </RadioSessionProvider>
  );
}
