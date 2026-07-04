import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useCatalogLoaded, useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { useLayoutMode } from '@/shared/hooks/useMediaQuery';
import {
  isCurating,
  isIdle,
  isSessionComplete,
} from '@/features/radio/session/playbackSelectors';
import { LoreToggle } from '@/shared/ui/LoreToggle';
import { IntentOnboarding } from './IntentOnboarding';
import { SessionSummary } from './SessionSummary';
import { Skeleton } from '@/shared/ui/Skeleton';
import { cn } from '@/shared/lib/cn';
import { prefersReducedMotion } from '@/shared/lib/motion';
import { useMobileChrome } from './mobileChrome';
import styles from './ContentSheet.module.css';

gsap.registerPlugin(useGSAP);

export function ContentSheet() {
  const sheetRef = useRef<HTMLElement>(null);
  const loreRef = useRef<HTMLParagraphElement>(null);
  const state = useRadioState();
  const { handleStart } = useRadioActions();
  const { isWide } = useLayoutMode();
  const idle = isIdle(state.phase);
  const complete = isSessionComplete(state.phase);
  const curating = isCurating(state.phase);
  const catalogLoaded = useCatalogLoaded();
  const track = useTrackMeta(state.trackId);
  const showSkeleton = curating || (idle && !catalogLoaded);
  const showOnboarding = idle;
  const currentCoverUrl = state.albumCoverUrl || track.albumCoverUrl;
  const flowLabel = state.sessionSubtitle
    .split('·')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
  const queuedLabel = `${state.remainingTrackIds.length} in queue`;
  // Now-playing blurb: local tracks carry lore; a Spotify track has no catalog
  // entry, so fall back to the resolved artist persona / album concept the
  // copywriter pushes a few seconds in (#75). Sourced from the live catalog meta
  // (not the track-change snapshot) so a late voicing push fills it in.
  const lore =
    track.lore.trim() ||
    [track.artistPersona, track.albumConcept].map((s) => s.trim()).filter(Boolean).join(' ') ||
    state.lore.trim();
  const [loreExpanded, setLoreExpanded] = useState(false);
  const { reportScroll, showChrome } = useMobileChrome();

  // Keep the user's disclosure preference across tracks; only collapse when the new track has no lore.
  useEffect(() => {
    if (!lore) setLoreExpanded(false);
  }, [state.trackId, lore]);

  useEffect(() => {
    if (isWide) return;
    const el = sheetRef.current;
    if (el) el.scrollTop = 0;
    showChrome();
  }, [state.trackId, isWide, showChrome]);

  useEffect(() => {
    if (isWide) return;
    const el = sheetRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollHeight <= el.clientHeight + 1) return;
      reportScroll('sheet', el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isWide, reportScroll]);

  const showStory = Boolean(lore) && (isWide || loreExpanded);

  useGSAP(
    () => {
      const root = sheetRef.current;
      if (!root || prefersReducedMotion()) return;

      gsap.fromTo(
        root,
        { autoAlpha: 0, y: 14 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.52,
          ease: 'power3.out',
          clearProps: 'opacity,visibility,transform',
        },
      );
    },
    { scope: sheetRef },
  );

  useGSAP(
    () => {
      const el = loreRef.current;
      if (!el || isWide || !loreExpanded) return;

      if (prefersReducedMotion()) {
        gsap.set(el, { autoAlpha: 1, y: 0, clearProps: 'opacity,visibility,transform' });
        return;
      }

      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 10 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.3,
          ease: 'power2.out',
          clearProps: 'opacity,visibility,transform',
          overwrite: 'auto',
        },
      );
    },
    { scope: sheetRef, dependencies: [loreExpanded, lore, isWide], revertOnUpdate: true },
  );

  return (
    <section ref={sheetRef} className={styles.root} aria-label="Now playing">
      <div
        className={cn(styles.header, showOnboarding && styles.headerCompact)}
        aria-busy={showSkeleton || undefined}
      >
        {showSkeleton ? (
          <>
            <Skeleton variant="text" height={28} width="72%" className={styles.skeletonTitle} />
            <Skeleton variant="text" height={14} width="42%" className={styles.skeletonMeta} />
            <div className={styles.nowPlaying}>
              <Skeleton variant="rect" width={88} height={88} className={styles.cover} />
              <div className={styles.trackInfo}>
                <Skeleton variant="text" height={20} width="68%" />
                <div className={styles.skeletonMetaRow}>
                  <Skeleton variant="circle" width={32} height={32} />
                  <Skeleton variant="text" height={14} width="55%" className={styles.skeletonCredit} />
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={styles.nowPlaying}>
              <div className={styles.nowPlayingTop}>
                {currentCoverUrl ? (
                  <img
                    className={styles.cover}
                    src={currentCoverUrl}
                    alt=""
                    width={96}
                    height={96}
                    loading="lazy"
                  />
                ) : null}
                <div className={styles.trackInfo}>
                  <p className={styles.stationTitle} data-session-heading>{state.sessionTitle}</p>
                  <h1 className={styles.trackTitle}>{state.trackTitle}</h1>
                  <p className={styles.trackMeta}>
                    {state.artist}
                    {state.albumTitle ? ` · ${state.albumTitle}` : ''}
                  </p>
                </div>
                {!isWide && lore ? (
                  <LoreToggle
                    variant="icon"
                    expanded={loreExpanded}
                    onToggle={() => setLoreExpanded((open) => !open)}
                    controlsId="now-playing-lore"
                  />
                ) : null}
              </div>
              {showStory ? (
                <p
                  ref={!isWide ? loreRef : undefined}
                  id="now-playing-lore"
                  className={cn(styles.storyText, isWide && styles.loreScroll)}
                >
                  {lore}
                </p>
              ) : null}
              <div className={styles.sessionMetaBar}>
                <p>
                  <span>Flow</span>
                  {flowLabel || 'Adjusting live'}
                </p>
                <p>
                  <span>Queue</span>
                  {queuedLabel}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {showOnboarding ? (
        <IntentOnboarding onStart={(intent) => void handleStart(intent)} disabled={curating} />
      ) : null}

      {complete ? <SessionSummary /> : null}
    </section>
  );
}
