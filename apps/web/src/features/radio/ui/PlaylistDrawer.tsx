import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
import { cn } from '@/shared/lib/cn';
import { IconChevronUp } from '@/shared/ui/Icons';
import styles from './PlaylistDrawer.module.css';

/**
 * Retractable bottom playlist for the mobile (<768px) layout, where the side
 * "Up next" queue is dropped. Collapsed it's a handle bar above the mini
 * control bar; expanded it slides up to just below the session heading
 * (title + time), covering the rest of the session card with a scrollable
 * track list.
 */
export function PlaylistDrawer() {
  const state = useRadioState();
  const [open, setOpen] = useState(false);
  const current = useTrackMeta(state.trackId);
  const count = state.remainingTrackIds.length + 1;

  const drawerRef = useRef<HTMLElement>(null);
  const [peek, setPeek] = useState(0);

  // Measure how far down the session heading (title + time) reaches inside the
  // sheet area, so the expanded drawer can stop just below it and leave it
  // visible while the list obscures everything beneath.
  useEffect(() => {
    const area = drawerRef.current?.parentElement;
    if (!area) return;
    const heading = area.querySelector<HTMLElement>('[data-session-heading]');
    if (!heading) return;
    const measure = () => {
      const top = area.getBoundingClientRect().top;
      const bottom = heading.getBoundingClientRect().bottom;
      setPeek(Math.max(0, Math.round(bottom - top)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    ro.observe(heading);
    return () => ro.disconnect();
  }, [state.phase, state.sessionTitle, state.sessionSubtitle]);

  return (
    <section
      ref={drawerRef}
      className={cn(styles.drawer, open && styles.drawerOpen)}
      style={{ '--drawer-peek': `${peek}px` } as CSSProperties}
      aria-label="Up next"
    >
      <span className={styles.grip} aria-hidden />
      <button
        type="button"
        className={styles.handle}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="playlist-drawer-list"
      >
        <span className={styles.handleLabel}>Up next</span>
        {!open && <span className={styles.handleCount}>{count} tracks</span>}
        <IconChevronUp size={18} className={cn(styles.chevron, open && styles.chevronOpen)} />
      </button>

      <ul id="playlist-drawer-list" className={styles.list} aria-hidden={!open}>
        <li className={cn(styles.item, styles.itemCurrent)}>
          <span className={styles.index}>▶</span>
          <div className={styles.itemText}>
            <p className={styles.title}>{current.title}</p>
            <p className={styles.artist}>{current.artist}</p>
          </div>
          <span className={styles.duration}>{formatTime(current.durationSec)}</span>
        </li>
        {state.remainingTrackIds.map((id, i) => (
          <DrawerItem key={id} id={id} index={i + 2} />
        ))}
      </ul>
    </section>
  );
}

function DrawerItem({ id, index }: { id: string; index: number }) {
  const track = useTrackMeta(id);
  return (
    <li className={styles.item}>
      <span className={styles.index}>{index}</span>
      <div className={styles.itemText}>
        <p className={styles.title}>{track.title}</p>
        <p className={styles.artist}>{track.artist}</p>
      </div>
      <span className={styles.duration}>{formatTime(track.durationSec)}</span>
    </li>
  );
}
