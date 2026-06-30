import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Drawer } from 'vaul';
import { useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
import { cn } from '@/shared/lib/cn';
import { IconChevronUp } from '@/shared/ui/icons';
import { useMobileChrome } from './mobileChrome';
import styles from './PlaylistDrawer.module.css';

gsap.registerPlugin(useGSAP);

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Retractable bottom playlist for the mobile (<768px) layout. Uses vaul for
 * drag-to-close; the peek handle stays in the bottom chrome rail.
 */
export function PlaylistDrawer() {
  const state = useRadioState();
  const [open, setOpen] = useState(false);
  const current = useTrackMeta(state.trackId);
  const count = state.remainingTrackIds.length + 1;

  const drawerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { reportScroll, setChromePinned, showChrome } = useMobileChrome();

  useEffect(() => {
    setChromePinned(open);
    return () => setChromePinned(false);
  }, [open, setChromePinned]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const onScroll = () => {
      if (list.scrollHeight <= list.clientHeight + 1) return;
      reportScroll('playlist-drawer', list.scrollTop);
    };
    list.addEventListener('scroll', onScroll, { passive: true });
    return () => list.removeEventListener('scroll', onScroll);
  }, [open, reportScroll]);

  useGSAP(
    () => {
      const list = listRef.current;
      if (!list || !open) return;

      const items = gsap.utils.toArray<HTMLElement>(list.querySelectorAll(`.${styles.item}`));
      if (items.length === 0) return;

      if (prefersReducedMotion()) {
        gsap.set(items, { clearProps: 'opacity,visibility,transform' });
        return;
      }

      gsap.fromTo(
        items,
        { autoAlpha: 0, y: 10 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.28,
          stagger: 0.035,
          ease: 'power2.out',
          clearProps: 'opacity,visibility,transform',
          overwrite: 'auto',
        },
      );
    },
    {
      scope: drawerRef,
      dependencies: [open, state.trackId, state.remainingTrackIds.length],
      revertOnUpdate: true,
    },
  );

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) showChrome();
      }}
      shouldScaleBackground={false}
    >
      <div className={styles.peek} aria-label="Up next">
        <span className={styles.grip} aria-hidden />
        <Drawer.Trigger asChild>
          <button type="button" className={styles.handle}>
            <span className={styles.handleLabel}>Up next</span>
            {!open && <span className={styles.handleCount}>{count} tracks</span>}
            <IconChevronUp size={18} className={cn(styles.chevron, open && styles.chevronOpen)} />
          </button>
        </Drawer.Trigger>
      </div>

      <Drawer.Portal>
        <Drawer.Overlay className={styles.overlay} />
        <Drawer.Content ref={drawerRef} className={styles.sheet} aria-label="Up next tracks">
          <div className={styles.sheetHandle} aria-hidden />
          <ul id="playlist-drawer-list" ref={listRef} className={styles.list}>
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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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
