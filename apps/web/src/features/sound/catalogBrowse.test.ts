import { describe, expect, it } from 'vitest';
import type { TrackMeta } from '@auracle/shared';
import { groupCatalog } from './catalogBrowse';

function track(p: Partial<TrackMeta> & Pick<TrackMeta, 'id' | 'artistSlug' | 'albumSlug'>): TrackMeta {
  return {
    title: p.id,
    artist: p.artistSlug,
    artistId: `a-${p.artistSlug}`,
    albumId: `al-${p.albumSlug}`,
    albumTitle: p.albumSlug,
    albumCoverUrl: `/c/${p.albumSlug}.jpg`,
    artistPhotoUrl: `/a/${p.artistSlug}.jpg`,
    lore: '',
    artistPersona: '',
    albumConcept: '',
    energy: 3,
    tempo: 90,
    genre: 'g',
    genreSlug: 'g',
    mood: 'calm',
    scene: 'study',
    filePath: '',
    introOffsetMs: null,
    ...p,
  };
}

describe('groupCatalog', () => {
  it('groups tracks into artists and albums, de-duplicating and sorting', () => {
    const { artists, tracks } = groupCatalog([
      track({ id: 't02', artistSlug: 'zara', albumSlug: 'zara-one' }),
      track({ id: 't01', artistSlug: 'aria', albumSlug: 'aria-one' }),
      track({ id: 't03', artistSlug: 'aria', albumSlug: 'aria-one' }),
      track({ id: 't04', artistSlug: 'aria', albumSlug: 'aria-two' }),
    ]);

    // Artists sorted by name; Aria has two albums, Zara one.
    expect(artists.map((a) => a.slug)).toEqual(['aria', 'zara']);
    const aria = artists[0]!;
    expect(aria.albums.map((al) => al.slug)).toEqual(['aria-one', 'aria-two']);
    expect(aria.albums[0]!.coverUrl).toBe('/c/aria-one.jpg');
    expect(aria.albums[0]!.trackIds).toEqual(['t01', 't03']);

    // Flat track list sorted by id.
    expect(tracks.map((t) => t.id)).toEqual(['t01', 't02', 't03', 't04']);
    expect(tracks[0]).toMatchObject({ id: 't01', artistSlug: 'aria', albumSlug: 'aria-one' });
  });

  it('handles an empty catalog', () => {
    expect(groupCatalog([])).toEqual({ artists: [], tracks: [] });
  });
});
