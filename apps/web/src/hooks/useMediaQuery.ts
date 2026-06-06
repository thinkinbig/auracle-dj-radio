import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useLayoutMode() {
  const isWide = useMediaQuery('(min-width: 1024px)');
  const isPhoneFrame = useMediaQuery('(min-width: 768px)');
  const isLandscape = useMediaQuery('(orientation: landscape) and (max-height: 500px)');

  return { isWide, isPhoneFrame, isLandscape };
}
