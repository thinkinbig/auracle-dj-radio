import { useRadioActions, useRadioState } from '@/features/radio/session/RadioSessionContext';
import { useCatalogLoaded, useTrackMeta } from '@/shared/hooks/useTrackCatalog';
import { useSpotifyPlaybackState, type SpotifyQueueTrack } from '@/features/spotify/spotifyPlayback';
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
  const { handlePlaylistFeedback } = useRadioActions();
  const catalogLoaded = useCatalogLoaded();
  const spotify = useSpotifyPlaybackState();
  const current = useTrackMeta(state.trackId);
  const spotifyQueueReady = spotify.enabled && spotify.queueTracks.length > 0;
  const currentSpotifyTrack = spotify.queueTracks[state.currentTrackIndex];
  const remainingSpotifyTracks = spotify.queueTracks.slice(state.currentTrackIndex + 1);
  const recentlyChanged = new Set(state.recentlyChangedIds);
  let feedbackLabel = 'Feedback';
  if (state.queueRefreshStatus === 'pending') feedbackLabel = 'Rebuilding from current track...';
  else if (state.queueDiffMessage) feedbackLabel = state.queueDiffMessage;
  else if (state.queueRefreshStatus === 'complete') feedbackLabel = 'Queue checked';
  else if (state.queueRefreshStatus === 'error') feedbackLabel = 'Try again';
  else if (state.playlistFeedback === 'like') feedbackLabel = 'Host is keeping this direction';
  else if (state.playlistFeedback === 'dislike') feedbackLabel = 'Host is shifting the queue';
  else if (state.playlistFeedback === 'regenerate') feedbackLabel = 'Host is rebuilding the queue';

  return (
    <aside className={styles.root} aria-label="Up next" aria-busy={!catalogLoaded || undefined}>
      <div className={styles.header}>
        <div className={styles.tabs} aria-label="Queue view">
          <h3 className={cn(styles.heading, styles.headingActive)}>Up next</h3>
          <span className={cn(styles.sourceMode, spotify.enabled && styles.sourceModeSpotify)}>
            {spotify.enabled ? 'Spotify library' : 'Local files'}
          </span>
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.feedbackStatus} aria-live="polite">
            {feedbackLabel}
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
                disabled={state.queueRefreshStatus === 'pending'}
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
          {spotifyQueueReady && currentSpotifyTrack ? (
            <SpotifyQueueItem track={currentSpotifyTrack} index="▶" current />
          ) : (
            <div className={cn(styles.item, styles.itemCurrent)}>
              <span className={styles.index}>▶</span>
              <div className={styles.itemText}>
                <p className={styles.title}>{current.title}</p>
                <p className={styles.artist}>{current.artist}</p>
                <TrackSourceLine id={state.trackId} localTitle={current.title} />
              </div>
              <span className={styles.duration}>{formatTime(current.durationSec)}</span>
            </div>
          )}

          <ul className={styles.list}>
            {spotifyQueueReady
              ? remainingSpotifyTracks.map((track, i) => (
                  <SpotifyQueueItem key={track.uri} track={track} index={state.currentTrackIndex + i + 2} />
                ))
              : state.remainingTrackIds.map((id, i) => (
                  <TrackQueueItem key={id} id={id} index={i + 2} changed={recentlyChanged.has(id)} />
                ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function SpotifyQueueItem({ track, index, current }: { track: SpotifyQueueTrack; index: number | string; current?: boolean }) {
  const content = (
    <>
      <span className={styles.index}>{index}</span>
      <div className={styles.itemText}>
        <p className={styles.title}>{track.title}</p>
        <p className={styles.artist}>{track.artist}</p>
        <p className={styles.sourceLine}>
          Source: Spotify {track.source === 'saved' ? 'Saved tracks' : 'Top tracks'} · {track.reason}
        </p>
      </div>
      <span className={styles.duration}>{formatTime(track.durationSec)}</span>
    </>
  );
  if (current) return <div className={cn(styles.item, styles.itemCurrent)}>{content}</div>;
  return <li className={styles.item}>{content}</li>;
}

function TrackQueueItem({ id, index, changed }: { id: string; index: number; changed: boolean }) {
  const track = useTrackMeta(id);
  return (
    <li className={cn(styles.item, changed && styles.itemChanged)}>
      <span className={styles.index}>{index}</span>
      <div className={styles.itemText}>
        <p className={styles.title}>{track.title}</p>
        <p className={styles.artist}>{track.artist}</p>
        <TrackSourceLine id={id} localTitle={track.title} />
      </div>
      <span className={styles.duration}>{formatTime(track.durationSec)}</span>
    </li>
  );
}

function TrackSourceLine({ id, localTitle }: { id: string; localTitle: string }) {
  const spotify = useSpotifyPlaybackState();
  if (!spotify.enabled) {
    return <p className={styles.sourceLine}>Source: local file catalog</p>;
  }
  const match = spotify.trackMatches[id];
  if (!match) {
    return <p className={styles.sourceLine}>Source: building Spotify library queue</p>;
  }
  const fallback = match.fallback ? 'fallback' : 'matched';
  const sameTitle = normalizeLabel(match.title) === normalizeLabel(localTitle);
  return (
    <p className={styles.sourceLine}>
      Source: Spotify Search {fallback}: {sameTitle ? match.artist : `${match.title} · ${match.artist}`}
    </p>
  );
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
