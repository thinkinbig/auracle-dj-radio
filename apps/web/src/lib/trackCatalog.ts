import type { Track } from '@auracle/shared';

export interface TrackDisplay {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
}

/** Offline fallback aligned with apps/api seed-data (no duration in API). */
const FALLBACK: Record<string, TrackDisplay> = {
  t01: { id: 't01', title: 'Paper Lanterns', artist: 'Auracle', durationSec: 180 },
  t02: { id: 't02', title: 'Soft Static', artist: 'Auracle', durationSec: 180 },
  t03: { id: 't03', title: 'Morning Steam', artist: 'Auracle', durationSec: 180 },
  t04: { id: 't04', title: 'Quiet Desk', artist: 'Auracle', durationSec: 180 },
  t05: { id: 't05', title: 'Tide Pool', artist: 'Auracle', durationSec: 180 },
  t06: { id: 't06', title: 'Glass Garden', artist: 'Auracle', durationSec: 180 },
  t07: { id: 't07', title: 'Neon Commute', artist: 'Auracle', durationSec: 180 },
  t08: { id: 't08', title: 'City Pulse', artist: 'Auracle', durationSec: 180 },
  t09: { id: 't09', title: 'Run Lights', artist: 'Auracle', durationSec: 180 },
  t10: { id: 't10', title: 'Open Road', artist: 'Auracle', durationSec: 180 },
  t11: { id: 't11', title: 'Skyline Drive', artist: 'Auracle', durationSec: 180 },
  t12: { id: 't12', title: 'Peak Hour', artist: 'Auracle', durationSec: 180 },
  t13: { id: 't13', title: 'Full Send', artist: 'Auracle', durationSec: 180 },
  t14: { id: 't14', title: 'Afterglow', artist: 'Auracle', durationSec: 180 },
  t15: { id: 't15', title: 'Cooldown', artist: 'Auracle', durationSec: 180 },
  t16: { id: 't16', title: 'Last Light', artist: 'Auracle', durationSec: 180 },
};

const cache: Record<string, TrackDisplay> = { ...FALLBACK };

function fromApiTrack(t: Track): TrackDisplay {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    durationSec: cache[t.id]?.durationSec ?? 180,
  };
}

export function getTrackMeta(id: string): TrackDisplay {
  return cache[id] ?? { id, title: id, artist: 'Unknown', durationSec: 180 };
}

export async function fetchTrack(id: string): Promise<TrackDisplay> {
  try {
    const res = await fetch(`/tracks/${id}`);
    if (res.ok) {
      const track = (await res.json()) as Track;
      const meta = fromApiTrack(track);
      cache[id] = meta;
      return meta;
    }
  } catch {
    /* use fallback */
  }
  const meta = FALLBACK[id] ?? { id, title: id, artist: 'Unknown', durationSec: 180 };
  cache[id] = meta;
  return meta;
}

export async function prefetchTracks(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => fetchTrack(id)));
}
