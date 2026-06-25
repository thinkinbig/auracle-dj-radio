import { useEffect, useState } from 'react';
import { RadioSessionProvider, useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { getAppView } from '@/features/radio/session/playbackSelectors';
import { loadTrackCatalog } from '@/data/trackCatalog';
import { AppBrand } from '@/features/marketing/AppBrand';
import { AuthStatus } from '@/features/marketing/AuthStatus';
import { LandingPage } from '@/features/marketing/LandingPage';
import { logout, restoreUser } from '@/features/marketing/authApi';
import { MoodPickerScreen } from '@/features/radio/ui/MoodPickerScreen';
import { PlayerScreen } from '@/features/radio/ui/PlayerScreen';
import { SoundScreen } from '@/features/sound/SoundScreen';
import type { AuthUser } from '@auracle/shared';

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
  const [showSound, setShowSound] = useState(false);
  const state = useRadioState();
  const { handleReturnToSetup } = useRadioActions();
  const appView = getAppView(state.phase);

  if (showSound) {
    return <SoundScreen user={user} onClose={() => setShowSound(false)} />;
  }

  return (
    <>
      <AppBrand
        onClick={appView === 'playing' ? handleReturnToSetup : undefined}
        label={appView === 'playing' ? 'Set your station' : undefined}
      />
      <AuthStatus user={user} onLogout={onLogout} onOpenSound={() => setShowSound(true)} />
      <AppContent />
    </>
  );
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
