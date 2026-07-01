import type { PlannedTrack, TrackMeta } from '@auracle/shared';

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

/** Build display metadata for a self-describing slot from its inline fields (ADR-0005 §7). */
function fromSlot(ref: PlannedTrack): TrackDisplay {
  return {
    id: ref.id,
    title: ref.title,
    artist: ref.artist,
    albumTitle: ref.albumTitle,
    albumCoverUrl: ref.albumCoverUrl,
    artistPhotoUrl: '',
    lore: ref.voicing.lore,
    artistPersona: ref.voicing.artistPersona,
    albumConcept: ref.voicing.albumConcept,
    mood: '',
    durationSec: ref.durationSec,
  };
}

/**
 * Seed display metadata for self-describing (non-catalog) slots straight from the
 * slot. A catalog (`local:`) slot has a `/tracks/{id}` entry and is resolved by id
 * instead; every other slot carries its title/artist/cover and resolved DJ voicing
 * inline (the planner stamped them), so the queue/now-playing read them directly —
 * no separate voicing push. Later tracklist updates re-seed with the resolved copy.
 */
export function seedTracks(refs: PlannedTrack[]): void {
  let changed = false;
  for (const ref of refs) {
    if (!ref.uri.startsWith('local:')) {
      cache[ref.id] = fromSlot(ref);
      changed = true;
    }
  }
  if (changed) emitCatalogChange();
}

export async function fetchTrack(id: string): Promise<TrackDisplay> {
  if (cache[id]) return cache[id]!;
  // Seeded slots are cached from their inline metadata (seedTracks); never hit the
  // local catalog for a non-`local:` id (e.g. a `spotify:` uri) — it 404s.
  if (id.startsWith('spotify:')) return getTrackMeta(id);

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

export async function prefetchTracks(refs: PlannedTrack[]): Promise<void> {
  // Seeded slots resolve from their inline metadata; only catalog slots need a fetch.
  seedTracks(refs);
  const localIds = refs.filter((r) => r.uri.startsWith('local:')).map((r) => r.id);
  await Promise.all(localIds.map((id) => fetchTrack(id)));
}

/** @internal test helper */
export function resetTrackCatalogForTests(): void {
  for (const key of Object.keys(cache)) delete cache[key];
  catalogLoaded = false;
  catalogVersion = 0;
  listeners.clear();
}
