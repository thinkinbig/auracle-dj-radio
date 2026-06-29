import { AppShell } from './AppShell';
import { ContentSheet } from './ContentSheet';
import { MobileChromeProvider } from './mobileChrome';
import { MiniControlBar } from './MiniControlBar';
import { PlaylistDrawer } from './PlaylistDrawer';
import { StageHeader } from './StageHeader';
import { SupersededOverlay } from './SupersededOverlay';
import { TrackQueue } from './TrackQueue';
import { useLayoutMode } from '@/shared/hooks/useMediaQuery';
import styles from './PlayerScreen.module.css';

/** The live radio screen: now playing, DJ status, queue, transcript, and controls. */
export function PlayerScreen() {
  const { isWide, isPhoneFrame } = useLayoutMode();

  return (
    <div className={styles.root}>
      <MobileChromeProvider>
        <AppShell
          stage={<StageHeader />}
          sheet={<ContentSheet />}
          queue={isWide || isPhoneFrame ? <TrackQueue /> : undefined}
          drawer={!isPhoneFrame ? <PlaylistDrawer /> : undefined}
          miniBar={<MiniControlBar />}
        />
      </MobileChromeProvider>
      <SupersededOverlay />
    </div>
  );
}
