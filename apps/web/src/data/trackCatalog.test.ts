import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTrackCatalogSnapshot,
  getTrackMeta,
  isCatalogLoaded,
  loadTrackCatalog,
  resetTrackCatalogForTests,
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
});
