import { useEffect, useState, type RefObject } from 'react';

/** Bar count from container width so waveforms fill horizontal space. */
export function useBarCount(
  ref: RefObject<HTMLElement | null>,
  pxPerBar = 4,
  min = 24,
  max = 120,
): number {
  const [count, setCount] = useState(min);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      setCount(Math.max(min, Math.min(max, Math.floor(w / pxPerBar))));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, pxPerBar, min, max]);

  return count;
}
