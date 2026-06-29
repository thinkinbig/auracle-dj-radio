import { useCallback, useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined') return () => {};

      const mq = window.matchMedia(query);
      mq.addEventListener('change', onStoreChange);
      return () => mq.removeEventListener('change', onStoreChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false),
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useLayoutMode() {
  const isWide = useMediaQuery('(min-width: 1024px)');
  const isPhoneFrame = useMediaQuery('(min-width: 768px)');
  const isLandscape = useMediaQuery('(orientation: landscape) and (max-height: 500px)');

  return { isWide, isPhoneFrame, isLandscape };
}
