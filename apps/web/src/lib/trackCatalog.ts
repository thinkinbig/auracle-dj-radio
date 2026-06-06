import type { TrackMeta } from '@auracle/shared';

export interface TrackDisplay {
  id: string;
  title: string;
  artist: string;
  albumTitle: string;
  albumCoverUrl: string;
  artistPhotoUrl: string;
  lore: string;
  durationSec: number;
}

/** Offline fallback when API is unreachable (Batch 0 catalog). */
const FALLBACK: Record<string, TrackDisplay> = {
  t01: {
    id: 't01',
    title: 'Paper Lanterns',
    artist: 'Lana Del Delay',
    albumTitle: 'Born to Delay',
    albumCoverUrl: '/covers/alb-lana-delay-midnight.jpg',
    artistPhotoUrl: '/artists/a-lana-delay.jpg',
    lore: 'Lana Del Delay taped crackling lantern footage from a Kyoto alley and built the pad around that loop.',
    durationSec: 180,
  },
  t02: {
    id: 't02',
    title: 'Soft Static',
    artist: 'Lana Del Delay',
    albumTitle: 'Born to Delay',
    albumCoverUrl: '/covers/alb-lana-delay-midnight.jpg',
    artistPhotoUrl: '/artists/a-lana-delay.jpg',
    lore: 'Recorded on a dying cassette deck; the hiss is a feature.',
    durationSec: 180,
  },
};

const cache: Record<string, TrackDisplay> = { ...FALLBACK };

function fromApiTrack(t: TrackMeta): TrackDisplay {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    albumTitle: t.albumTitle,
    albumCoverUrl: t.albumCoverUrl,
    artistPhotoUrl: t.artistPhotoUrl,
    lore: t.lore,
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
      durationSec: 180,
    }
  );
}

export async function fetchTrack(id: string): Promise<TrackDisplay> {
  try {
    const res = await fetch(`/tracks/${id}`);
    if (res.ok) {
      const track = (await res.json()) as TrackMeta;
      const meta = fromApiTrack(track);
      cache[id] = meta;
      return meta;
    }
  } catch {
    /* use fallback */
  }
  const meta = FALLBACK[id] ?? getTrackMeta(id);
  cache[id] = meta;
  return meta;
}

export async function prefetchTracks(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => fetchTrack(id)));
}
