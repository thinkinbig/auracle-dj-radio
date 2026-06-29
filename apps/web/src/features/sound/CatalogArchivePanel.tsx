import { useEffect, useMemo, useState } from 'react';
import { IconChevronUp } from '@/shared/ui/Icons';
import { cn } from '@/shared/lib/cn';
import { loadBrowseCatalog, type BrowseCatalog, type BrowseTrack } from './catalogBrowse';
import styles from './CatalogArchivePanel.module.css';

const EMPTY_CATALOG: BrowseCatalog = { artists: [], tracks: [] };

function ArchiveTrackRow({ track }: { track: BrowseTrack }) {
  const lore = track.lore.trim();
  const [expanded, setExpanded] = useState(false);
  const loreId = `archive-lore-${track.id}`;

  return (
    <div className={styles.trackRow}>
      {track.coverUrl ? (
        <img className={styles.trackCover} src={track.coverUrl} alt="" width={32} height={32} loading="lazy" />
      ) : (
        <span className={styles.trackCoverFallback} aria-hidden />
      )}
      <div className={styles.trackMeta}>
        <p className={styles.trackTitle}>{track.title}</p>
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

/** Read-only artist → album → track browse for My Sound (#61). */
export function CatalogArchivePanel() {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalog, setCatalog] = useState<BrowseCatalog>(EMPTY_CATALOG);

  useEffect(() => {
    let cancelled = false;
    void loadBrowseCatalog()
      .then((next) => {
        if (!cancelled) {
          setCatalog(next);
          setLoadState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tracksById = useMemo(() => new Map(catalog.tracks.map((t) => [t.id, t])), [catalog.tracks]);

  if (loadState === 'loading') return <p className={styles.muted}>Loading catalog archive…</p>;
  if (loadState === 'error') {
    return <p className={styles.error}>Could not load the catalog archive. Refresh to try again.</p>;
  }

  return (
    <div className={styles.panel}>
      {catalog.artists.map((artist) => (
        <article key={artist.slug} className={styles.artistCard}>
          <div className={styles.artistHead}>
            {artist.photoUrl ? (
              <img className={styles.avatar} src={artist.photoUrl} alt="" loading="lazy" />
            ) : (
              <span className={styles.avatar} aria-hidden />
            )}
            <div className={styles.artistCopy}>
              <h3 className={styles.artistName}>{artist.name}</h3>
              {artist.persona ? (
                <>
                  <p className={styles.entityKicker}>About the artist</p>
                  <p className={styles.persona}>{artist.persona}</p>
                </>
              ) : null}
            </div>
          </div>
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
                    return track ? <ArchiveTrackRow key={id} track={track} /> : null;
                  })}
                </div>
              </section>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
