import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/shared/lib/cn';
import styles from './mobileChrome.module.css';

interface MobileChromeContextValue {
  hidden: boolean;
  reportScroll: (source: string, scrollTop: number) => void;
  setChromePinned: (pinned: boolean) => void;
  showChrome: () => void;
}

const MobileChromeContext = createContext<MobileChromeContextValue | null>(null);

const HIDE_SCROLL_MIN = 48;
const HIDE_DELTA_MIN = 16;
const SHOW_DELTA_MIN = 16;
const SHOW_SCROLL_MAX = 8;

/** Auto-hide the mobile bottom chrome (playlist peek + mini bar) while scrolling content. */
export function MobileChromeProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const pinnedRef = useRef(false);
  const lastScrollTopBySource = useRef<Record<string, number>>({});
  const rafRef = useRef<number | null>(null);
  const pendingScroll = useRef<{ source: string; scrollTop: number } | null>(null);

  const applyHidden = useCallback((next: boolean) => {
    if (hiddenRef.current === next) return;
    hiddenRef.current = next;
    setHidden(next);
  }, []);

  const showChrome = useCallback(() => {
    lastScrollTopBySource.current = {};
    applyHidden(false);
  }, [applyHidden]);

  const setChromePinned = useCallback(
    (nextPinned: boolean) => {
      pinnedRef.current = nextPinned;
      if (nextPinned) applyHidden(false);
    },
    [applyHidden],
  );

  const flushScroll = useCallback(() => {
    rafRef.current = null;
    const pending = pendingScroll.current;
    if (!pending) return;

    const { source, scrollTop } = pending;
    const previous = lastScrollTopBySource.current[source];
    lastScrollTopBySource.current[source] = scrollTop;
    if (previous === undefined) return;

    const delta = scrollTop - previous;

    if (pinnedRef.current) {
      applyHidden(false);
      return;
    }

    if (scrollTop > HIDE_SCROLL_MIN && delta > HIDE_DELTA_MIN) {
      applyHidden(true);
      return;
    }

    if (delta < -SHOW_DELTA_MIN || scrollTop <= SHOW_SCROLL_MAX) {
      applyHidden(false);
    }
  }, [applyHidden]);

  const reportScroll = useCallback(
    (source: string, scrollTop: number) => {
      pendingScroll.current = { source, scrollTop };
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(flushScroll);
    },
    [flushScroll],
  );

  const value = useMemo(
    () => ({ hidden, reportScroll, setChromePinned, showChrome }),
    [hidden, reportScroll, setChromePinned, showChrome],
  );

  return <MobileChromeContext.Provider value={value}>{children}</MobileChromeContext.Provider>;
}

export function useMobileChrome(): MobileChromeContextValue {
  const ctx = useContext(MobileChromeContext);
  if (!ctx) {
    return {
      hidden: false,
      reportScroll: () => {},
      setChromePinned: () => {},
      showChrome: () => {},
    };
  }
  return ctx;
}

/** Bottom chrome stack: playlist drawer + mini bar, hidden via transform (no layout shift). */
export function MobileChromeRail({
  drawer,
  miniBar,
}: {
  drawer?: ReactNode;
  miniBar: ReactNode;
}) {
  const { hidden } = useMobileChrome();

  return (
    <div className={cn(styles.chromeRail, hidden && styles.chromeRailHidden)}>
      {drawer}
      {miniBar}
    </div>
  );
}
