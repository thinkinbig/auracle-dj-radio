import { useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { ContentSheet } from './components/ContentSheet';
import { MiniControlBar } from './components/MiniControlBar';
import { StageHeader } from './components/StageHeader';
import { TrackQueue } from './components/TrackQueue';
import { useLayoutMode } from './hooks/useMediaQuery';
import { useRadioSession } from './hooks/useRadioSession';
import { DJ_NAME } from './lib/constants';

export default function App() {
  const { state, analyser, handleStart, handleTogglePause, handleSkipTrack, handleChangeHostMode } =
    useRadioSession();
  const { isWide } = useLayoutMode();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePause();
      } else if (e.code === 'ArrowRight' || e.code === 'KeyN') {
        e.preventDefault();
        handleSkipTrack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleTogglePause, handleSkipTrack]);

  return (
    <AppShell
      stage={
        <StageHeader
          djName={DJ_NAME}
          phase={state.phase}
          sessionElapsedSec={state.sessionElapsedSec}
          analyser={analyser}
          liveWarning={state.liveWarning}
          hostMode={state.hostMode}
          onChangeHostMode={handleChangeHostMode}
        />
      }
      sheet={
        <ContentSheet
          phase={state.phase}
          sessionTitle={state.sessionTitle}
          sessionSubtitle={state.sessionSubtitle}
          trackTitle={state.trackTitle}
          artist={state.artist}
          progressSec={state.progressSec}
          durationSec={state.durationSec}
          transcript={state.transcript}
          activeTranscriptId={state.activeTranscriptId}
          djName={DJ_NAME}
          onTogglePause={handleTogglePause}
          onSkipTrack={handleSkipTrack}
          hasNextTrack={state.remainingTrackIds.length > 0}
          onStart={handleStart}
        />
      }
      queue={
        isWide ? (
          <TrackQueue currentTrackId={state.trackId} remainingTrackIds={state.remainingTrackIds} />
        ) : undefined
      }
      miniBar={
        <MiniControlBar
          phase={state.phase}
          progressSec={state.progressSec}
          durationSec={state.durationSec}
          hasNextTrack={state.remainingTrackIds.length > 0}
          onTogglePause={handleTogglePause}
          onSkipTrack={handleSkipTrack}
        />
      }
    />
  );
}
