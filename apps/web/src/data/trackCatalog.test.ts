import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlannedTrack } from '@auracle/shared';
import {
  getTrackCatalogSnapshot,
  getTrackMeta,
  isCatalogLoaded,
  loadTrackCatalog,
  resetTrackCatalogForTests,
  seedTracks,
  subscribeTrackCatalog,
} from '@/data/trackCatalog';

describe('trackCatalog', () => {
  afterEach(() => {
    resetTrackCatalogForTests();
    vi.restoreAllMocks();
  });

  it('notifies subscribers when the catalog loads', async () => {
    const versions: number[] = [];
    subscribeTrackCatalog(() => versions.push(getTrackCatalogSnapshot()));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tracks: [
            {
              id: 't1',
              title: 'Song One',
              artist: 'Artist A',
              albumTitle: 'Album',
              albumCoverUrl: '/covers/a.jpg',
              artistPhotoUrl: '',
              lore: 'Lore',
              mood: 'calm',
            },
          ],
        }),
      }),
    );

    await loadTrackCatalog();

    expect(versions).toEqual([1]);
    expect(isCatalogLoaded()).toBe(true);
    expect(getTrackMeta('t1').title).toBe('Song One');
    expect(getTrackMeta('t1').mood).toBe('calm');
  });

  it('does not notify when the catalog fetch fails', async () => {
    const versions: number[] = [];
    subscribeTrackCatalog(() => versions.push(getTrackCatalogSnapshot()));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await loadTrackCatalog();

    expect(versions).toEqual([]);
    expect(isCatalogLoaded()).toBe(false);
  });

  it('seeds a self-describing (non-catalog) slot from its inline metadata + voicing (#75)', () => {
    const ref: PlannedTrack = {
      id: 'spotify:track:1',
      uri: 'spotify:track:1',
      flow_position: 1,
      reason: 'r',
      title: 'Holding You',
      artist: 'Cigarettes After Sex',
      albumTitle: "X's",
      albumCoverUrl: '/cover.jpg',
      durationSec: 200,
      energy: 3,
      voicing: { artistPersona: 'Hazy slowcore romantics', albumConcept: 'Cigarette-smoke ballads', lore: '' },
    };
    seedTracks([ref]);
    expect(getTrackMeta('spotify:track:1')).toMatchObject({
      title: 'Holding You',
      artist: 'Cigarettes After Sex',
      durationSec: 200,
      artistPersona: 'Hazy slowcore romantics',
      albumConcept: 'Cigarette-smoke ballads',
    });
  });

  it('re-seeding a slot updates its resolved voicing in place', () => {
    const base: PlannedTrack = {
      id: 'spotify:track:2',
      uri: 'spotify:track:2',
      flow_position: 1,
      reason: 'r',
      title: 'Apocalypse',
      artist: 'Cigarettes After Sex',
      albumTitle: 'Cigarettes After Sex',
      albumCoverUrl: '/cover.jpg',
      durationSec: 290,
      energy: 3,
      voicing: { artistPersona: '', albumConcept: '', lore: '' },
    };
    seedTracks([base]);
    expect(getTrackMeta('spotify:track:2').artistPersona).toBe('');

    seedTracks([{ ...base, voicing: { artistPersona: 'Dream-pop reverb', albumConcept: 'Widescreen longing', lore: '' } }]);
    expect(getTrackMeta('spotify:track:2')).toMatchObject({
      title: 'Apocalypse', // inline fields preserved
      artistPersona: 'Dream-pop reverb',
      albumConcept: 'Widescreen longing',
    });
  });

  it('does not seed a catalog (local:) slot (resolved by id instead)', () => {
    const local: PlannedTrack = {
      id: 't42',
      uri: 'local:t42',
      flow_position: 1,
      reason: 'r',
      title: '',
      artist: '',
      albumTitle: '',
      albumCoverUrl: '',
      durationSec: 0,
      energy: 3,
      voicing: { artistPersona: '', albumConcept: '', lore: '' },
    };
    seedTracks([local]);
    // No cache entry seeded → getTrackMeta falls back to the id placeholder.
    expect(getTrackMeta('t42').title).toBe('t42');
  });
});
