import { useEffect, useMemo, useRef, useState } from 'react';
import { IconChevronUp, IconPause, IconPlay } from '@/shared/ui/Icons';
import { Skeleton } from '@/shared/ui/Skeleton';
import { cn } from '@/shared/lib/cn';
import { filterCatalog, loadBrowseCatalog, type BrowseCatalog, type BrowseTrack } from './catalogBrowse';
import { useCatalogPreview } from './useCatalogPreview';
import styles from './CatalogArchivePanel.module.css';

const EMPTY_CATALOG: BrowseCatalog = { artists: [], tracks: [] };

function CatalogSkeleton() {
  return (
    <div className={styles.skeletonList} aria-busy="true" aria-label="Loading catalog">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonHead}>
            <Skeleton variant="circle" width={48} height={48} />
            <div className={styles.skeletonCopy}>
              <Skeleton variant="text" height={18} width="42%" />
              <Skeleton variant="text" height={12} width="68%" />
            </div>
          </div>
          <Skeleton variant="rect" height={52} />
        </div>
      ))}
    </div>
  );
}

function ArchiveTrackRow({
  track,
  playing,
  active,
  onTogglePlay,
}: {
  track: BrowseTrack;
  playing: boolean;
  active: boolean;
  onTogglePlay: () => void;
}) {
  const lore = track.lore.trim();
  const [expanded, setExpanded] = useState(false);
  const loreId = `archive-lore-${track.id}`;

  return (
    <div className={cn(styles.trackRow, active && styles.trackRowActive, active && !playing && styles.trackRowPaused)}>
      <button
        type="button"
        className={cn(styles.playBtn, playing && styles.playBtnActive)}
        aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
        aria-pressed={playing}
        onClick={onTogglePlay}
      >
        {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
      </button>
      {track.coverUrl ? (
        <img className={styles.trackCover} src={track.coverUrl} alt="" width={40} height={40} loading="lazy" />
      ) : (
        <span className={styles.trackCoverFallback} aria-hidden />
      )}
      <div className={styles.trackMeta}>
        <p className={styles.trackTitle}>{track.title}</p>
        <p className={styles.trackArtist}>{track.artist}</p>
        {playing ? <span className={styles.nowPlayingTag}>Now previewing</span> : null}
        {lore ? (
          <>
            <button
              type="button"
              className={styles.loreToggle}
              aria-expanded={expanded}
              aria-controls={loreId}
              onClick={() => setExpanded((open) => !open)}
            >
              {expanded ? 'Hide story' : 'Track story'}
              <IconChevronUp
                size={14}
                className={cn(styles.loreChevron, !expanded && styles.loreChevronCollapsed)}
              />
            </button>
            {expanded ? (
              <p id={loreId} className={styles.lore}>
                {lore}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

interface CatalogArchivePanelProps {
  /** Match Library page accent; defaults to Taste purple. */
  tone?: 'default' | 'library';
  onTrackCount?: (count: number) => void;
}

/** Artist → album → track browse with local preview playback. */
export function CatalogArchivePanel({ tone = 'default', onTrackCount }: CatalogArchivePanelProps) {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalog, setCatalog] = useState<BrowseCatalog>(EMPTY_CATALOG);
  const [query, setQuery] = useState('');
  const preview = useCatalogPreview();
  const onTrackCountRef = useRef(onTrackCount);
  onTrackCountRef.current = onTrackCount;

  useEffect(() => {
    let cancelled = false;
    void loadBrowseCatalog()
      .then((next) => {
        if (!cancelled) {
          setCatalog(next);
          setLoadState('ready');
          onTrackCountRef.current?.(next.tracks.length);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => filterCatalog(catalog, query), [catalog, query]);
  const tracksById = useMemo(() => new Map(filtered.tracks.map((t) => [t.id, t])), [filtered.tracks]);
  const isFiltering = query.trim().length > 0;
  const activeTrack = preview.activeId ? tracksById.get(preview.activeId) ?? catalog.tracks.find((t) => t.id === preview.activeId) : undefined;

  if (loadState === 'loading') return <CatalogSkeleton />;
  if (loadState === 'error') {
    return <p className={styles.error}>Could not load the catalog. Refresh to try again.</p>;
  }

  return (
    <div className={cn(styles.shell, tone === 'library' && styles.shellLibrary)}>
      <div className={styles.toolbar}>
        <label className={styles.searchLabel}>
          <span className={styles.searchKicker}>Search</span>
          <input
            className={styles.searchInput}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Track or artist"
            aria-label="Search catalog by track or artist"
          />
        </label>
        <span className={styles.trackCount}>
          {isFiltering ? `${filtered.tracks.length} of ${catalog.tracks.length}` : `${catalog.tracks.length} tracks`}
        </span>
      </div>

      {activeTrack ? (
        <div className={styles.nowPlayingBar} role="status" aria-live="polite">
          {activeTrack.coverUrl ? (
            <img className={styles.nowPlayingCover} src={activeTrack.coverUrl} alt="" width={44} height={44} />
          ) : (
            <span className={styles.nowPlayingCoverFallback} aria-hidden />
          )}
          <div className={styles.nowPlayingMeta}>
            <span className={styles.nowPlayingKicker}>{preview.isPlaying ? 'Now previewing' : 'Paused'}</span>
            <strong>{activeTrack.title}</strong>
            <small>{activeTrack.artist}</small>
          </div>
          <button
            type="button"
            className={styles.nowPlayingBtn}
            aria-label={preview.isPlaying ? `Pause ${activeTrack.title}` : `Resume ${activeTrack.title}`}
            onClick={() => preview.toggle(activeTrack.id)}
          >
            {preview.isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
          </button>
        </div>
      ) : null}

      {filtered.artists.length === 0 ? (
        <p className={styles.empty}>No tracks match &ldquo;{query.trim()}&rdquo;. Try another search.</p>
      ) : (
        <div className={styles.panel}>
          {filtered.artists.map((artist, index) => (
            <details
              key={artist.slug}
              className={styles.artistCard}
              open={isFiltering || index === 0}
            >
              <summary className={styles.artistSummary}>
                {artist.photoUrl ? (
                  <img className={styles.avatar} src={artist.photoUrl} alt="" loading="lazy" />
                ) : (
                  <span className={styles.avatar} aria-hidden />
                )}
                <div className={styles.artistCopy}>
                  <h3 className={styles.artistName}>{artist.name}</h3>
                  <p className={styles.artistMeta}>
                    {artist.albums.length} album{artist.albums.length === 1 ? '' : 's'}
                  </p>
                </div>
                <IconChevronUp size={16} className={styles.artistChevron} aria-hidden />
              </summary>
              {artist.persona ? (
                <div className={styles.artistBody}>
                  <p className={styles.entityKicker}>About the artist</p>
                  <p className={styles.persona}>{artist.persona}</p>
                </div>
              ) : null}
              <div className={styles.albumList}>
                {artist.albums.map((album) => (
                  <section key={album.slug} className={styles.albumCard}>
                    <div className={styles.albumHead}>
                      {album.coverUrl ? (
                        <img className={styles.albumCover} src={album.coverUrl} alt="" loading="lazy" />
                      ) : (
                        <span className={styles.albumCover} aria-hidden />
                      )}
                      <div className={styles.albumCopy}>
                        <h4 className={styles.albumTitle}>{album.title}</h4>
                        {album.concept ? (
                          <>
                            <p className={styles.entityKicker}>Album concept</p>
                            <p className={styles.concept}>{album.concept}</p>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className={styles.trackList}>
                      {album.trackIds.map((id) => {
                        const track = tracksById.get(id);
                        return track ? (
                          <ArchiveTrackRow
                            key={id}
                            track={track}
                            playing={preview.isTrackPlaying(track.id)}
                            active={preview.isTrackActive(track.id)}
                            onTogglePlay={() => preview.toggle(track.id)}
                          />
                        ) : null;
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
