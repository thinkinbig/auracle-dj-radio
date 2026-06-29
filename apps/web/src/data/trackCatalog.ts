import type { TrackMeta } from '@auracle/shared';

export interface TrackDisplay {
  id: string;
  title: string;
  artist: string;
  albumTitle: string;
  albumCoverUrl: string;
  artistPhotoUrl: string;
  lore: string;
  artistPersona: string;
  albumConcept: string;
  /** Display-only curator tag; selection uses energy, not mood (ADR-0001). */
  mood: string;
  durationSec: number;
}

const cache: Record<string, TrackDisplay> = {};
let catalogLoaded = false;
let catalogVersion = 0;
const listeners = new Set<() => void>();

function emitCatalogChange(): void {
  catalogVersion += 1;
  for (const listener of listeners) listener();
}

export function subscribeTrackCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot for useSyncExternalStore; bumps when any track meta is added or updated. */
export function getTrackCatalogSnapshot(): number {
  return catalogVersion;
}

function fromApiTrack(t: TrackMeta): TrackDisplay {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    albumTitle: t.albumTitle,
    albumCoverUrl: t.albumCoverUrl,
    artistPhotoUrl: t.artistPhotoUrl,
    lore: t.lore,
    artistPersona: t.artistPersona ?? '',
    albumConcept: t.albumConcept ?? '',
    mood: t.mood,
    durationSec: cache[t.id]?.durationSec ?? 180,
  };
}

export function getTrackMeta(id: string): TrackDisplay {
  return (
    cache[id] ?? {
      id,
      title: id,
      artist: 'Unknown',
      albumTitle: '',
      albumCoverUrl: '',
      artistPhotoUrl: '',
      lore: '',
      artistPersona: '',
      albumConcept: '',
      mood: '',
      durationSec: 180,
    }
  );
}

export function listCatalogTracks(): TrackDisplay[] {
  return Object.values(cache).sort((a, b) => a.id.localeCompare(b.id));
}

export function isCatalogLoaded(): boolean {
  return catalogLoaded;
}

/** Load the full offline catalog from the API (manifest tracks with assets on disk). */
export async function loadTrackCatalog(): Promise<void> {
  try {
    const res = await fetch('/catalog/tracks');
    if (!res.ok) return;
    const body = (await res.json()) as { tracks: TrackMeta[] };
    for (const track of body.tracks) {
      cache[track.id] = fromApiTrack(track);
    }
    catalogLoaded = body.tracks.length > 0;
    if (catalogLoaded) emitCatalogChange();
  } catch {
    /* offline — per-track fetch may still populate cache */
  }
}

export async function fetchTrack(id: string): Promise<TrackDisplay> {
  if (cache[id]) return cache[id]!;

  try {
    const res = await fetch(`/tracks/${id}`);
    if (res.ok) {
      const track = (await res.json()) as TrackMeta;
      const meta = fromApiTrack(track);
      cache[id] = meta;
      emitCatalogChange();
      return meta;
    }
  } catch {
    /* use placeholder */
  }

  const meta = getTrackMeta(id);
  cache[id] = meta;
  return meta;
}

export async function prefetchTracks(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => fetchTrack(id)));
}

/** @internal test helper */
export function resetTrackCatalogForTests(): void {
  for (const key of Object.keys(cache)) delete cache[key];
  catalogLoaded = false;
  catalogVersion = 0;
  listeners.clear();
}
