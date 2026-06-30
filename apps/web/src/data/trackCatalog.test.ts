import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FlowTrackRef } from '@auracle/shared';
import {
  getTrackCatalogSnapshot,
  getTrackMeta,
  isCatalogLoaded,
  loadTrackCatalog,
  mergeSpotifyVoicing,
  resetTrackCatalogForTests,
  seedSpotifyTracks,
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

  it('seeds Spotify slots from inline metadata, then fills voicing on a later push (#75)', () => {
    const ref: FlowTrackRef = {
      id: 'spotify:track:1',
      flow_position: 1,
      reason: 'r',
      source: 'spotify',
      spotify: {
        uri: 'spotify:track:1',
        title: 'Holding You',
        artist: 'Cigarettes After Sex',
        albumTitle: "X's",
        albumCoverUrl: '/cover.jpg',
        durationSec: 200,
      },
    };
    seedSpotifyTracks([ref]);
    expect(getTrackMeta('spotify:track:1')).toMatchObject({
      title: 'Holding You',
      artist: 'Cigarettes After Sex',
      durationSec: 200,
      artistPersona: '',
      albumConcept: '',
    });

    mergeSpotifyVoicing({
      'spotify:track:1': { artistPersona: 'Hazy slowcore romantics', albumConcept: 'Cigarette-smoke ballads', lore: '' },
    });
    expect(getTrackMeta('spotify:track:1')).toMatchObject({
      title: 'Holding You', // inline fields preserved
      artistPersona: 'Hazy slowcore romantics',
      albumConcept: 'Cigarette-smoke ballads',
    });
  });

  it('mergeSpotifyVoicing ignores a uri that was never seeded', () => {
    mergeSpotifyVoicing({ 'spotify:track:ghost': { artistPersona: 'x', albumConcept: 'y', lore: '' } });
    expect(getTrackMeta('spotify:track:ghost').artistPersona).toBe('');
  });
});
