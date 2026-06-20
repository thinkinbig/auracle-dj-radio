import { useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useCatalogLoaded, useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { cn } from '@/shared/lib/cn';
import { Skeleton } from '@/shared/ui/Skeleton';
import styles from './TrackQueue.module.css';

function TrackQueueSkeletonItem({ current }: { current?: boolean }) {
  return (
    <div className={cn(styles.item, current && styles.itemCurrent)}>
      <Skeleton variant="text" width={20} height={12} className={styles.indexSkeleton} />
      <div className={styles.skeletonText}>
        <Skeleton variant="text" height={14} width="78%" />
        <Skeleton variant="text" height={12} width="52%" className={styles.skeletonArtist} />
      </div>
    </div>
  );
}

export function TrackQueue() {
  const state = useRadioState();
  const catalogLoaded = useCatalogLoaded();
  const current = useTrackMeta(state.trackId);

  return (
    <aside className={styles.root} aria-label="Up next" aria-busy={!catalogLoaded || undefined}>
      <h3 className={styles.heading}>Up next</h3>

      {!catalogLoaded ? (
        <>
          <TrackQueueSkeletonItem current />
          <div className={styles.list}>
            {state.remainingTrackIds.slice(0, 4).map((id) => (
              <TrackQueueSkeletonItem key={id} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={cn(styles.item, styles.itemCurrent)}>
            <span className={styles.index}>▶</span>
            <div>
              <p className={styles.title}>{current.title}</p>
              <p className={styles.artist}>{current.artist}</p>
            </div>
          </div>

          <ul className={styles.list}>
            {state.remainingTrackIds.map((id, i) => (
              <TrackQueueItem key={id} id={id} index={i + 2} />
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function TrackQueueItem({ id, index }: { id: string; index: number }) {
  const track = useTrackMeta(id);
  return (
    <li className={styles.item}>
      <span className={styles.index}>{index}</span>
      <div>
        <p className={styles.title}>{track.title}</p>
        <p className={styles.artist}>{track.artist}</p>
      </div>
    </li>
  );
}
