import type { TasteEntityType, TastePolarity } from '@auracle/shared';
import { cn } from '@/shared/lib/cn';
import { useTasteEditor } from './useTasteEditor';
import {
  canSetTrack,
  countByType,
  MAX_TRACK_AVOID,
  MAX_TRACK_PREFER,
  ORPHAN_BANNER_THRESHOLD,
  orphanedEntries,
  orphanRatio,
  polarityOf,
  type Selection,
} from './tasteSelection';
import styles from './TastePanel.module.css';

/** Prefer / Neutral / Avoid control shared by every entity row. */
function PolarityControl({
  polarity,
  onToggle,
  onClear,
  disablePrefer = false,
  disableAvoid = false,
  size = 'md',
}: {
  polarity: TastePolarity | undefined;
  onToggle: (next: TastePolarity) => void;
  onClear: () => void;
  disablePrefer?: boolean;
  disableAvoid?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <span className={cn(styles.polarity, size === 'sm' && styles.polaritySm)}>
      <button
        type="button"
        className={cn(styles.polarityBtn, polarity === 'prefer' && styles.prefer)}
        aria-pressed={polarity === 'prefer'}
        disabled={disablePrefer}
        onClick={() => onToggle('prefer')}
      >
        Prefer
      </button>
      <button
        type="button"
        className={cn(styles.polarityBtn, polarity === undefined && styles.neutral)}
        aria-pressed={polarity === undefined}
        onClick={onClear}
      >
        Neutral
      </button>
      <button
        type="button"
        className={cn(styles.polarityBtn, polarity === 'avoid' && styles.avoid)}
        aria-pressed={polarity === 'avoid'}
        disabled={disableAvoid}
        onClick={() => onToggle('avoid')}
      >
        Avoid
      </button>
    </span>
  );
}

function summarize(selection: Selection): string {
  const types: TasteEntityType[] = ['genre', 'artist', 'album', 'track'];
  const parts: string[] = [];
  for (const type of types) {
    const prefer = countByType(selection, type, 'prefer');
    const avoid = countByType(selection, type, 'avoid');
    if (prefer) parts.push(`${prefer} ${type}${prefer > 1 ? 's' : ''} preferred`);
    if (avoid) parts.push(`${avoid} ${type}${avoid > 1 ? 's' : ''} avoided`);
  }
  return parts.length ? parts.join(' · ') : 'No taste set yet. Browse below to start.';
}

function totalByPolarity(selection: Selection, polarity: TastePolarity): number {
  const types: TasteEntityType[] = ['genre', 'artist', 'album', 'track'];
  return types.reduce((total, type) => total + countByType(selection, type, polarity), 0);
}

export function TastePanel() {
  const editor = useTasteEditor();
  const { selection, genres, catalog, toggle, clear } = editor;

  if (editor.loadState === 'loading') {
    return <p className={styles.muted}>Loading your taste...</p>;
  }
  if (editor.loadState === 'error') {
    return <p className={styles.errorText}>Couldn’t load your taste editor. Refresh to try again.</p>;
  }

  const orphans = orphanedEntries(selection);
  const showOrphanBanner = orphanRatio(selection) > ORPHAN_BANNER_THRESHOLD;
  const trackPins = countByType(selection, 'track', 'prefer');
  const trackBlocks = countByType(selection, 'track', 'avoid');
  const preferTotal = totalByPolarity(selection, 'prefer');
  const avoidTotal = totalByPolarity(selection, 'avoid');

  return (
    <div className={styles.panel}>
      <section className={styles.overview} aria-label="Taste summary">
        <div>
          <p className={styles.overline}>Profile signal</p>
          <p className={styles.summary} aria-live="polite">
            {summarize(selection)}
          </p>
        </div>
        <div className={styles.signalStats}>
          <span>
            <strong>{preferTotal}</strong>
            Prefer
          </span>
          <span>
            <strong>{avoidTotal}</strong>
            Avoid
          </span>
          <span>
            <strong>{trackPins}/{MAX_TRACK_PREFER}</strong>
            Pins
          </span>
        </div>
      </section>

      {showOrphanBanner && (
        <div className={styles.banner} role="alert">
          The catalog changed and several of your picks no longer exist. Review and remove them below.
        </div>
      )}

      <fieldset className={styles.group}>
        <legend>
          <span>Genres</span>
          <small>Set the station's center of gravity</small>
        </legend>
        <div className={styles.chipGrid}>
          {genres.map((g) => (
            <div key={g.slug} className={styles.chipRow}>
              <span className={styles.chipLabel}>
                {g.label} <small>{g.count}</small>
              </span>
              <PolarityControl
                size="sm"
                polarity={polarityOf(selection, 'genre', g.slug)}
                onToggle={(p) => toggle('genre', g.slug, p)}
                onClear={() => clear('genre', g.slug)}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>
          <span>Artists and albums</span>
          <small>Guide the palette without locking the DJ in</small>
        </legend>
        <div className={styles.artistList}>
          {catalog.artists.map((artist) => (
            <div key={artist.slug} className={styles.artistCard}>
              <div className={styles.artistHead}>
                {artist.photoUrl ? (
                  <img className={styles.avatar} src={artist.photoUrl} alt="" loading="lazy" />
                ) : (
                  <span className={styles.avatar} aria-hidden />
                )}
                <span className={styles.artistName}>{artist.name}</span>
                <PolarityControl
                  polarity={polarityOf(selection, 'artist', artist.slug)}
                  onToggle={(p) => toggle('artist', artist.slug, p)}
                  onClear={() => clear('artist', artist.slug)}
                />
              </div>
              <div className={styles.albumList}>
                {artist.albums.map((album) => (
                  <div key={album.slug} className={styles.albumRow}>
                    {album.coverUrl ? (
                      <img className={styles.albumCover} src={album.coverUrl} alt="" loading="lazy" />
                    ) : (
                      <span className={styles.albumCover} aria-hidden />
                    )}
                    <span className={styles.albumTitle}>{album.title}</span>
                    <PolarityControl
                      size="sm"
                      polarity={polarityOf(selection, 'album', album.slug)}
                      onToggle={(p) => toggle('album', album.slug, p)}
                      onClear={() => clear('album', album.slug)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>
          <span>Tracks</span>
          <small>Pin {trackPins}/{MAX_TRACK_PREFER} favorites · block {trackBlocks}/{MAX_TRACK_AVOID}</small>
        </legend>
        <div className={styles.trackList}>
          {catalog.tracks.map((track) => (
            <div key={track.id} className={styles.trackRow}>
              {track.coverUrl ? (
                <img className={styles.cover} src={track.coverUrl} alt="" loading="lazy" />
              ) : (
                <span className={styles.cover} aria-hidden />
              )}
              <span className={styles.trackMeta}>
                <strong>{track.title}</strong>
                <small>{track.artist}</small>
              </span>
              <PolarityControl
                size="sm"
                polarity={polarityOf(selection, 'track', track.id)}
                onToggle={(p) => toggle('track', track.id, p)}
                onClear={() => clear('track', track.id)}
                disablePrefer={!canSetTrack(selection, track.id, 'prefer')}
                disableAvoid={!canSetTrack(selection, track.id, 'avoid')}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>
          <span>Notes</span>
          <small>Add the human texture the catalog cannot infer</small>
        </legend>
        <textarea
          className={styles.freeText}
          rows={3}
          placeholder="e.g. lean jazzier in the evenings"
          value={editor.freeText}
          onChange={(e) => editor.setFreeText(e.target.value)}
        />
      </fieldset>

      {orphans.length > 0 && (
        <fieldset className={cn(styles.group, styles.orphanGroup)}>
          <legend>
            <span>Removed from the catalog</span>
            <small>Clean up old preferences</small>
          </legend>
          <p className={styles.muted}>These no longer exist and will not be saved. Remove them to tidy up.</p>
          <div className={styles.orphanList}>
            {orphans.map((o) => (
              <div key={`${o.entityType}:${o.entityId}`} className={styles.orphanRow}>
                <span>
                  {o.polarity} {o.entityType} <code>{o.entityId}</code>
                </span>
                <button type="button" className={styles.removeBtn} onClick={() => editor.removeOrphan(o.entityType, o.entityId)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <div className={styles.actions}>
        <span className={styles.saveHint}>Ready when the profile feels like you.</span>
        <button type="button" className={styles.saveBtn} disabled={editor.saveState === 'saving'} onClick={editor.save}>
          {editor.saveState === 'saving' ? 'Saving...' : 'Save taste'}
        </button>
        {editor.saveState === 'saved' && (
          <span className={styles.saved} role="status">
            Saved · {summarize(selection)}
          </span>
        )}
        {editor.saveState === 'error' && (
          <span className={styles.errorText} role="alert">
            {editor.errorMessage}
          </span>
        )}
      </div>
    </div>
  );
}
