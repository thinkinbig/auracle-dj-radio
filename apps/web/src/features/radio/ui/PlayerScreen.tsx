import { AppShell } from './AppShell';
import { ContentSheet } from './ContentSheet';
import { MiniControlBar } from './MiniControlBar';
import { PlaylistDrawer } from './PlaylistDrawer';
import { StageHeader } from './StageHeader';
import { TrackQueue } from './TrackQueue';
import { useLayoutMode } from '@/shared/hooks/useMediaQuery';

/** The live radio screen: now playing, DJ status, queue, transcript, and controls. */
export function PlayerScreen() {
  const { isWide, isPhoneFrame } = useLayoutMode();

  return (
    <AppShell
      stage={<StageHeader />}
      sheet={<ContentSheet />}
      queue={isWide ? <TrackQueue /> : undefined}
      drawer={!isPhoneFrame ? <PlaylistDrawer /> : undefined}
      miniBar={<MiniControlBar />}
    />
  );
}
