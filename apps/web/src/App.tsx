import { useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { ContentSheet } from './components/ContentSheet';
import { MiniControlBar } from './components/MiniControlBar';
import { OnboardingPage } from './components/OnboardingPage';
import { StageHeader } from './components/StageHeader';
import { TrackQueue } from './components/TrackQueue';
import { RadioSessionProvider, useRadioActions, useRadioState } from './context/RadioSessionContext';
import { useLayoutMode } from './hooks/useMediaQuery';
import { isIdle } from './lib/playbackSelectors';
import { loadTrackCatalog } from './lib/trackCatalog';

function AppContent() {
  const state = useRadioState();
  const { handleTogglePause, handleSkipTrack } = useRadioActions();
  const { isWide } = useLayoutMode();

  useEffect(() => {
    void loadTrackCatalog();
  }, []);

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

  if (isIdle(state.phase)) return <OnboardingPage />;

  return (
    <AppShell
      stage={<StageHeader />}
      sheet={<ContentSheet />}
      queue={isWide ? <TrackQueue /> : undefined}
      miniBar={<MiniControlBar />}
    />
  );
}

export default function App() {
  return (
    <RadioSessionProvider>
      <AppContent />
    </RadioSessionProvider>
  );
}
