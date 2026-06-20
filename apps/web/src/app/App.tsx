import { useEffect } from 'react';
import { RadioSessionProvider, useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { getAppView } from '@/features/radio/session/playbackSelectors';
import { loadTrackCatalog } from '@/data/trackCatalog';
import { MoodPickerScreen } from '@/features/radio/ui/MoodPickerScreen';
import { PlayerScreen } from '@/features/radio/ui/PlayerScreen';

function AppContent() {
  const state = useRadioState();
  const { handleTogglePause, handleSkipTrack } = useRadioActions();
  const appView = getAppView(state.phase);

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

  if (appView === 'mood_picking') return <MoodPickerScreen />;

  return <PlayerScreen />;
}

export default function App() {
  return (
    <RadioSessionProvider>
      <AppContent />
    </RadioSessionProvider>
  );
}
