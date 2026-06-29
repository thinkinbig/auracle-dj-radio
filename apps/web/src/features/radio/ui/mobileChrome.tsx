import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface MobileChromeContextValue {
  hidden: boolean;
  reportScroll: (source: string, scrollTop: number) => void;
  setChromePinned: (pinned: boolean) => void;
  showChrome: () => void;
}

const MobileChromeContext = createContext<MobileChromeContextValue | null>(null);

/** Auto-hide the mobile bottom chrome (playlist peek + mini bar) while scrolling content. */
export function MobileChromeProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [pinned, setPinned] = useState(false);
  const lastScrollTopBySource = useRef<Record<string, number>>({});

  const showChrome = useCallback(() => {
    setHidden(false);
    lastScrollTopBySource.current = {};
  }, []);

  const setChromePinned = useCallback((nextPinned: boolean) => {
    setPinned(nextPinned);
    if (nextPinned) setHidden(false);
  }, []);

  const reportScroll = useCallback(
    (source: string, scrollTop: number) => {
      const lastScrollTop = lastScrollTopBySource.current[source] ?? 0;
      const delta = scrollTop - lastScrollTop;

      lastScrollTopBySource.current[source] = scrollTop;

      if (pinned) {
        setHidden(false);
        return;
      }

      if (scrollTop > 40 && delta > 10) setHidden(true);
      if (delta < -10 || scrollTop <= 12) setHidden(false);
    },
    [pinned],
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
