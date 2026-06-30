import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ImportedPlaylistProfile, PlaylistImportListResponse, PlaylistImportSource, PlaylistImportTrack } from '@auracle/shared';
import { useAuth } from '@/features/marketing/AuthProvider';
import { isGuestUser } from '@/features/marketing/guest';
import { CatalogArchivePanel } from '@/features/sound/CatalogArchivePanel';
import { FeaturePageShell } from '@/shared/ui/FeaturePageShell';
import enter from '@/shared/ui/FeatureEnter.module.css';
import { queryKeys } from '@/shared/query/keys';
import { cn } from '@/shared/lib/cn';
import { describePlaylistImportError, saveImportedPlaylist } from './playlistImportApi';
import { parsePlaylistInput, sourceLabel } from './playlistImportParser';
import { useImportedPlaylistsQuery } from './useImportedPlaylistsQuery';
import styles from './ImportPlaylistScreen.module.css';

const SAMPLE = `Night Drive, Nova Pulse, After Hours, Synthwave, 2014
Glass Coast, Mirrorline, Coastline, Dream pop, 2018
Rain Study, Lana Delay, Slow Rooms, Ambient, 2021`;

const SOURCE_OPTIONS: { value: PlaylistImportSource; label: string; detail: string }[] = [
  { value: 'csv', label: 'CSV', detail: 'Title, artist, album, genre, year' },
  { value: 'manual', label: 'Paste', detail: 'One song per line' },
  { value: 'spotify_export', label: 'Spotify export', detail: 'Metadata CSV or JSON' },
];

export function ImportPlaylistScreen() {
  const { user } = useAuth();
  const isGuest = isGuestUser(user!);
  const queryClient = useQueryClient();
  const playlistsQuery = useImportedPlaylistsQuery(!isGuest);
  const profiles = playlistsQuery.data?.playlists ?? [];
  const [source, setSource] = useState<PlaylistImportSource>('csv');
  const [name, setName] = useState('My music archive');
  const [rawInput, setRawInput] = useState(SAMPLE);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState<ImportedPlaylistProfile | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [catalogTrackCount, setCatalogTrackCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parsePlaylistInput(rawInput, source), [rawInput, source]);
  const stats = useMemo(() => summarizePreview(parsed.tracks), [parsed.tracks]);
  const canSave = !isGuest && name.trim().length > 0 && parsed.tracks.length > 0 && !isSaving;

  async function readFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setRawInput(text);
    if (name === 'My music archive') setName(file.name.replace(/\.[^.]+$/, '') || 'Imported playlist');
  }

  async function save() {
    if (!canSave) return;
    setIsSaving(true);
    setError(undefined);
    setSaved(undefined);
    try {
      const res = await saveImportedPlaylist({ name: name.trim(), source, tracks: parsed.tracks });
      setSaved(res.profile);
      queryClient.setQueryData<PlaylistImportListResponse>(queryKeys.playlists, (current) => {
        const existing = current?.playlists ?? [];
        return {
          playlists: [res.profile, ...existing.filter((profile) => profile.id !== res.profile.id)],
        };
      });
    } catch (err) {
      setError(describePlaylistImportError(err));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <FeaturePageShell
      pageClassName={styles.page}
      headerClassName={styles.header}
      mainClassName={styles.main}
      hero={
        <div className={styles.heroGrid}>
          <section className={styles.heroCopy} aria-labelledby="import-title">
            <h1 id="import-title" className={cn(enter.enter, enter.d90)}>Your music library.</h1>
            <p className={cn(enter.enter, enter.d180)}>
              Browse and preview every track in the Auracle catalog, or import playlists so future
              stations can learn from your history.
            </p>
          </section>
          <div className={cn(styles.memoryCard, enter.enter, enter.d280)} aria-hidden>
            <span>Local catalog</span>
            <strong>{catalogTrackCount != null ? `${catalogTrackCount} tracks` : '…'}</strong>
            <div className={styles.signalRows}>
              <i style={{ '--width': catalogTrackCount ? '88%' : '36%' } as CSSProperties} />
              <i style={{ '--width': `${Math.min(92, Math.max(28, stats.topArtists.length * 18))}%` } as CSSProperties} />
              <i style={{ '--width': `${Math.min(88, Math.max(24, stats.topGenres.length * 20))}%` } as CSSProperties} />
            </div>
          </div>
        </div>
      }
    >
      <section className={cn(styles.catalogPanel, enter.enter, enter.d360)} aria-labelledby="library-catalog-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Browse</p>
            <h2 id="library-catalog-title">Auracle catalog</h2>
          </div>
          <span className={styles.countBadge}>On device</span>
        </div>
        <CatalogArchivePanel tone="library" onTrackCount={setCatalogTrackCount} />
      </section>

      {isGuest ? (
        <GuestGate />
      ) : (
        <>
          <div className={styles.sectionDivider} role="separator" aria-label="Import section">
            <span>Import your history</span>
          </div>

          <section className={styles.importGrid}>
            <div className={cn(styles.editorPanel, enter.enter, enter.d440)}>
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.kicker}>Source</p>
                  <h2>Add playlist data</h2>
                </div>
                <button className={styles.fileButton} type="button" onClick={() => fileRef.current?.click()}>
                  Choose file
                </button>
                <input
                  ref={fileRef}
                  className={styles.fileInput}
                  type="file"
                  accept=".csv,.txt,.json,.tsv"
                  onChange={(event) => void readFile(event.target.files?.[0])}
                />
              </div>

              <label className={styles.label}>
                Playlist name
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={90} />
              </label>

              <div className={styles.sourceList} role="radiogroup" aria-label="Playlist source">
                {SOURCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(styles.sourceCard, source === option.value && styles.sourceCardActive)}
                    aria-pressed={source === option.value}
                    onClick={() => setSource(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.detail}</span>
                  </button>
                ))}
              </div>

              <label className={styles.label}>
                Metadata
                <textarea
                  value={rawInput}
                  onChange={(event) => setRawInput(event.target.value)}
                  spellCheck={false}
                  placeholder="Title, Artist, Album, Genre, Year"
                />
              </label>
            </div>

            <aside className={cn(styles.previewPanel, enter.enter, enter.d520)} aria-label="Import preview">
              <div className={styles.panelHeader}>
                <div>
                  <p className={styles.kicker}>Preview</p>
                  <h2>{sourceLabel(source)}</h2>
                </div>
                <span className={styles.countBadge}>{parsed.tracks.length} tracks</span>
              </div>

              <div className={styles.stats}>
                <span>
                  <strong>{stats.topArtists[0] ?? 'No artist'}</strong>
                  top artist
                </span>
                <span>
                  <strong>{stats.topGenres[0] ?? 'Mixed'}</strong>
                  top genre
                </span>
                <span>
                  <strong>{stats.yearRange ?? 'Open'}</strong>
                  years
                </span>
              </div>

              <div className={styles.trackPreview}>
                {parsed.tracks.slice(0, 8).map((track, index) => (
                  <div key={`${track.title}-${track.artist}-${index}`} className={styles.trackRow}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{track.title}</strong>
                      <small>{track.artist}{track.album ? ` · ${track.album}` : ''}</small>
                    </div>
                    <em>{track.year ?? track.genre ?? ''}</em>
                  </div>
                ))}
                {parsed.tracks.length === 0 ? <p className={styles.empty}>No valid tracks detected yet.</p> : null}
              </div>

              {parsed.warnings.length > 0 ? (
                <div className={styles.warnings} role="status">
                  {parsed.warnings.slice(0, 3).map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              ) : null}

              <button className={styles.saveButton} type="button" disabled={!canSave} onClick={() => void save()}>
                {isSaving ? 'Saving music...' : 'Save Music Memory'}
              </button>
              {saved ? <p className={styles.success}>Saved {saved.trackCount} tracks to your music memory.</p> : null}
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </aside>
          </section>

          <section className={cn(styles.savedPanel, enter.enter, enter.d620)} aria-label="Imported playlists">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.kicker}>Saved imports</p>
                <h2>Music memory</h2>
              </div>
              <span className={styles.countBadge}>{profiles.length}</span>
            </div>
            <div className={styles.savedList}>
              {profiles.map((profile) => (
                <article key={profile.id} className={styles.savedItem}>
                  <strong>{profile.name}</strong>
                  <span>{profile.trackCount} tracks · {sourceLabel(profile.source)}</span>
                  <small>{profile.summary.topArtists.slice(0, 3).join(', ') || 'Mixed artists'}</small>
                </article>
              ))}
              {profiles.length === 0 ? <p className={styles.empty}>No imported music yet.</p> : null}
            </div>
          </section>
        </>
      )}
    </FeaturePageShell>
  );
}

function GuestGate() {
  return (
    <section className={cn(styles.guestGate, enter.enter, enter.d440)}>
      <p className={styles.kicker}>Login required</p>
      <h2>Import needs an account.</h2>
      <p>Guest mode can browse and preview the catalog, but imported playlists are saved to your personal taste memory.</p>
    </section>
  );
}

function summarizePreview(tracks: PlaylistImportTrack[]): {
  topArtists: string[];
  topGenres: string[];
  yearRange?: string;
} {
  const years = tracks.map((track) => track.year).filter((year): year is number => typeof year === 'number');
  return {
    topArtists: topValues(tracks.map((track) => track.artist)),
    topGenres: topValues(tracks.map((track) => track.genre).filter((genre): genre is string => Boolean(genre))),
    ...(years.length ? { yearRange: `${Math.min(...years)}-${Math.max(...years)}` } : {}),
  };
}

function topValues(values: string[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key) continue;
    const current = counts.get(key);
    counts.set(key, { label: current?.label ?? value.trim(), count: (current?.count ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5)
    .map((item) => item.label);
}
