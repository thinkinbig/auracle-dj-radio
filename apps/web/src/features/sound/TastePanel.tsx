import type { TasteEntityType, TastePolarity } from '@auracle/shared';
import { cn } from '@/shared/lib/cn';
import { useTasteEditor } from './useTasteEditor';
import {
  canSetTrack,
  countByType,
  MAX_TRACK_AVOID,
  MAX_TRACK_PREFER,
  orphanedEntries,
  polarityOf,
  type Selection,
} from './tasteSelection';
import styles from './TastePanel.module.css';

/** Prefer / Avoid toggle pair shared by every entity row. */
function PolarityControl({
  polarity,
  onToggle,
  disablePrefer = false,
  disableAvoid = false,
  size = 'md',
}: {
  polarity: TastePolarity | undefined;
  onToggle: (next: TastePolarity) => void;
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
  return parts.length ? parts.join(' · ') : 'No taste set yet — browse below to start.';
}

export function TastePanel() {
  const editor = useTasteEditor();
  const { selection, genres, catalog, toggle } = editor;

  if (editor.loadState === 'loading') {
    return <p className={styles.muted}>Loading your taste…</p>;
  }
  if (editor.loadState === 'error') {
    return <p className={styles.errorText}>Couldn’t load your taste editor. Refresh to try again.</p>;
  }

  const orphans = orphanedEntries(selection);
  const trackPins = countByType(selection, 'track', 'prefer');
  const trackBlocks = countByType(selection, 'track', 'avoid');

  return (
    <div className={styles.panel}>
      <p className={styles.summary} aria-live="polite">
        {summarize(selection)}
      </p>

      {/* Genres — chips from the live taxonomy. */}
      <fieldset className={styles.group}>
        <legend>Genres</legend>
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
              />
            </div>
          ))}
        </div>
      </fieldset>

      {/* Artists & albums — browse cards, albums nested per artist. */}
      <fieldset className={styles.group}>
        <legend>Artists &amp; albums</legend>
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
                />
              </div>
              <div className={styles.albumList}>
                {artist.albums.map((album) => (
                  <div key={album.slug} className={styles.albumRow}>
                    <span className={styles.albumTitle}>{album.title}</span>
                    <PolarityControl
                      size="sm"
                      polarity={polarityOf(selection, 'album', album.slug)}
                      onToggle={(p) => toggle('album', album.slug, p)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {/* Tracks — pin up to 5, block up to 3. */}
      <fieldset className={styles.group}>
        <legend>
          Tracks <small>pin {trackPins}/{MAX_TRACK_PREFER} · block {trackBlocks}/{MAX_TRACK_AVOID}</small>
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
                disablePrefer={!canSetTrack(selection, track.id, 'prefer')}
                disableAvoid={!canSetTrack(selection, track.id, 'avoid')}
              />
            </div>
          ))}
        </div>
      </fieldset>

      {/* Free text — stored with the profile (mem0 colour). */}
      <fieldset className={styles.group}>
        <legend>Anything else?</legend>
        <textarea
          className={styles.freeText}
          rows={2}
          placeholder="e.g. lean jazzier in the evenings"
          value={editor.freeText}
          onChange={(e) => editor.setFreeText(e.target.value)}
        />
      </fieldset>

      {/* Orphaned prefs from a past catalog — greyed, removable. */}
      {orphans.length > 0 && (
        <fieldset className={cn(styles.group, styles.orphanGroup)}>
          <legend>Removed from the catalog</legend>
          <p className={styles.muted}>These no longer exist and won’t be saved. Remove them to tidy up.</p>
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
        <button type="button" className={styles.saveBtn} disabled={editor.saveState === 'saving'} onClick={editor.save}>
          {editor.saveState === 'saving' ? 'Saving…' : 'Save taste'}
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
