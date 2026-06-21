import { useState } from 'react';
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
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);
  const [regenerated, setRegenerated] = useState(false);

  return (
    <aside className={styles.root} aria-label="Up next" aria-busy={!catalogLoaded || undefined}>
      <div className={styles.header}>
        <h3 className={styles.heading}>Up next</h3>
        <div className={styles.actions} aria-label="Playlist feedback">
          <button
            type="button"
            className={cn(styles.action, feedback === 'like' && styles.actionActive)}
            onClick={() => setFeedback((value) => (value === 'like' ? null : 'like'))}
            aria-pressed={feedback === 'like'}
          >
            Like
          </button>
          <button
            type="button"
            className={cn(styles.action, feedback === 'dislike' && styles.actionActive)}
            onClick={() => setFeedback((value) => (value === 'dislike' ? null : 'dislike'))}
            aria-pressed={feedback === 'dislike'}
          >
            Dislike
          </button>
          <button
            type="button"
            className={cn(styles.action, regenerated && styles.actionActive)}
            onClick={() => setRegenerated(true)}
            aria-pressed={regenerated}
          >
            {regenerated ? 'Regenerated' : 'Regenerate'}
          </button>
        </div>
      </div>

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
