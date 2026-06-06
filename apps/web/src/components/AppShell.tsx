import type { ReactNode } from 'react';
import { useLayoutMode } from '../hooks/useMediaQuery';
import { cn } from '../lib/cn';
import styles from './AppShell.module.css';

interface AppShellProps {
  stage: ReactNode;
  sheet: ReactNode;
  queue?: ReactNode;
  miniBar: ReactNode;
}

export function AppShell({ stage, sheet, queue, miniBar }: AppShellProps) {
  const { isWide, isPhoneFrame, isLandscape } = useLayoutMode();
  const layout = isWide ? 'split' : isPhoneFrame ? 'frame' : 'mobile';

  return (
    <div className={styles.page}>
      <div
        className={cn(
          styles.shell,
          layout === 'split' && styles.shellSplit,
          layout === 'frame' && styles.shellFrame,
          layout === 'mobile' && styles.shellMobile,
        )}
        data-layout={layout === 'split' ? 'split' : 'stack'}
        data-landscape={isLandscape || undefined}
      >
        {isWide ? (
          <>
            <div className={styles.split}>
              <div className={styles.stageCol}>{stage}</div>
              <div className={styles.contentCol}>
                {sheet}
                {queue}
              </div>
            </div>
            <div className={styles.miniWide}>{miniBar}</div>
          </>
        ) : (
          <>
            {stage}
            {sheet}
            <div className={styles.stackMini}>{miniBar}</div>
          </>
        )}
      </div>
    </div>
  );
}
