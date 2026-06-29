import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { selectQueueRefresh } from '@/features/radio/session/playbackSelectors';
import { useCatalogLoaded, useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { formatTime } from '@/shared/lib/formatTime';
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
  const { handlePlaylistFeedback, handleRetryExtend } = useRadioActions();
  const catalogLoaded = useCatalogLoaded();
  const current = useTrackMeta(state.trackId);
  const recentlyChanged = new Set(state.recentlyChangedIds);
  const refresh = selectQueueRefresh(state);
  const extendRetryable = refresh.retryable;
  let feedbackLabel = 'Feedback';
  if (refresh.pending) {
    feedbackLabel = refresh.intent === 'regenerate'
      ? 'Rebuilding from current track...'
      : 'Finding more music...';
  } else if (state.queueDiffMessage) feedbackLabel = state.queueDiffMessage;
  else if (refresh.status === 'complete') feedbackLabel = 'Queue checked';
  else if (extendRetryable) feedbackLabel = 'More tracks unavailable · Try again';
  else if (refresh.failed) feedbackLabel = 'Try again';
  else if (state.playlistFeedback === 'like') feedbackLabel = 'Host is keeping this direction';
  else if (state.playlistFeedback === 'dislike') feedbackLabel = 'Host is shifting the queue';
  else if (state.playlistFeedback === 'regenerate') feedbackLabel = 'Host is rebuilding the queue';

  return (
    <aside className={styles.root} aria-label="Up next" aria-busy={!catalogLoaded || undefined}>
      <div className={styles.header}>
        <div className={styles.tabs} aria-label="Queue view">
          <h3 className={cn(styles.heading, styles.headingActive)}>Up next</h3>
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.feedbackStatus} aria-live="polite">
            {extendRetryable ? (
              <button type="button" className={styles.feedbackRetry} onClick={handleRetryExtend}>
                {feedbackLabel}
              </button>
            ) : (
              feedbackLabel
            )}
          </div>
          <div className={styles.feedbackBar} aria-label="Playlist feedback">
            <div className={styles.actions}>
              <button
                type="button"
                className={cn(styles.action, state.playlistFeedback === 'like' && styles.actionActive)}
                onClick={() => handlePlaylistFeedback('like')}
                aria-pressed={state.playlistFeedback === 'like'}
              >
                Like
              </button>
              <button
                type="button"
                className={cn(styles.action, state.playlistFeedback === 'dislike' && styles.actionActive)}
                onClick={() => handlePlaylistFeedback('dislike')}
                aria-pressed={state.playlistFeedback === 'dislike'}
              >
                Dislike
              </button>
              <button
                type="button"
                className={cn(styles.action, state.playlistFeedback === 'regenerate' && styles.actionActive)}
                onClick={() => handlePlaylistFeedback('regenerate')}
                aria-pressed={state.playlistFeedback === 'regenerate'}
                disabled={refresh.pending}
              >
                Regenerate
              </button>
            </div>
          </div>
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
            <div className={styles.itemText}>
              <p className={styles.title}>{current.title}</p>
              <p className={styles.artist}>{current.artist}</p>
            </div>
            <span className={styles.duration}>{formatTime(current.durationSec)}</span>
          </div>

          <ul className={styles.list}>
            {state.remainingTrackIds.map((id, i) => (
              <TrackQueueItem key={id} id={id} index={i + 2} changed={recentlyChanged.has(id)} />
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function TrackQueueItem({ id, index, changed }: { id: string; index: number; changed: boolean }) {
  const track = useTrackMeta(id);
  return (
    <li className={cn(styles.item, changed && styles.itemChanged)}>
      <span className={styles.index}>{index}</span>
      <div className={styles.itemText}>
        <p className={styles.title}>{track.title}</p>
        <p className={styles.artist}>{track.artist}</p>
      </div>
      <span className={styles.duration}>{formatTime(track.durationSec)}</span>
    </li>
  );
}
