import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./spotifyAuth', () => ({
  clearSpotifyToken: vi.fn(),
  getSpotifyConfig: vi.fn(() => ({ clientId: 'spotify-client', redirectUri: 'http://localhost/spotify/callback' })),
  getValidSpotifyAccessToken: vi.fn(async () => 'spotify-token'),
  hasSpotifyToken: vi.fn(() => true),
}));

import { buildSpotifyTasteRoast, getSpotifyTasteProfile, type SpotifyTasteProfile } from './spotifyTaste';

function profile(overrides: Partial<SpotifyTasteProfile> = {}): SpotifyTasteProfile {
  return {
    status: 'ready',
    generatedAt: '2026-07-03T00:00:00.000Z',
    savedTrackCount: 64,
    recentTrackCount: 50,
    topArtists: [
      { id: 'artist-1', name: 'The Loopers', genres: ['indie pop'], popularity: 48, imageUrl: '' },
    ],
    topTracks: [
      {
        id: 'track-1',
        name: 'Again Again',
        artist: 'The Loopers',
        album: 'Repeat Deluxe',
        popularity: 52,
        imageUrl: '',
        uri: 'spotify:track:1',
      },
    ],
    topGenres: [{ name: 'indie pop', count: 12 }],
    recentArtists: [{ name: 'The Loopers', count: 18 }],
    metrics: [
      { label: 'Niche score', value: '52%', detail: 'Balanced between familiar and niche' },
      { label: 'Genre focus', value: '60%', detail: 'Most concentrated around indie pop' },
      { label: 'Recent repeat', value: '36%', detail: 'Recent plays lean toward The Loopers' },
      { label: 'Library depth', value: '64', detail: 'Liked tracks sampled for Auracle context' },
    ],
    hostSeed: 'indie pop-fluent',
    summary: 'Core sound: indie pop.',
    ...overrides,
  };
}

describe('buildSpotifyTasteRoast', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('turns concentrated repeat listening into a high-heat verdict', () => {
    const roast = buildSpotifyTasteRoast(profile());

    expect(roast.verdict).toBe('Certified Repeat Offender');
    expect(roast.score).toBeGreaterThanOrEqual(70);
    expect(roast.burns.join(' ')).toContain('The Loopers');
    expect(roast.evidence.map((item) => item.label)).toEqual([
      'Niche score',
      'Genre focus',
      'Recent repeat',
      'Library depth',
    ]);
  });

  it('keeps the roast usable when Spotify has sparse metrics', () => {
    const roast = buildSpotifyTasteRoast(profile({
      savedTrackCount: 8,
      topArtists: [],
      topTracks: [],
      topGenres: [],
      recentArtists: [],
      metrics: [
        { label: 'Niche score', value: 'Learning', detail: 'Waiting for Spotify popularity signals' },
        { label: 'Genre focus', value: '0%', detail: 'Top artist genres will appear here' },
        { label: 'Recent repeat', value: '0%', detail: 'Recent plays will shape this' },
        { label: 'Library depth', value: '8', detail: 'Liked tracks sampled for Auracle context' },
      ],
    }));

    expect(roast.verdict).toBe('Soft Roast, Medium Evidence');
    expect(roast.burns.length).toBeGreaterThan(0);
    expect(roast.evidence.map((item) => item.label)).toEqual([
      'Recent repeat',
      'Library depth',
    ]);
    expect(roast.summary).toContain('mixed taste signals');
    expect(roast.tags).toContain('mixed taste signals');
  });
});

describe('getSpotifyTasteProfile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates saved-track artists so top genre and niche score can be computed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/me/top/artists')) {
        return jsonResponse({ items: [] });
      }
      if (url.includes('/me/top/tracks')) {
        return jsonResponse({ items: [] });
      }
      if (url.includes('/me/tracks')) {
        return jsonResponse({
          total: 2,
          items: [
            { track: spotifyTrack('track-1', 'Mirror Room', 'artist-1', 'The Loopers') },
            { track: spotifyTrack('track-2', 'Glass Repeat', 'artist-1', 'The Loopers') },
          ],
          next: null,
        });
      }
      if (url.includes('/me/player/recently-played')) {
        return jsonResponse({ items: [{ track: spotifyTrack('track-3', 'Recent Loop', 'artist-1', 'The Loopers') }] });
      }
      if (url.includes('/artists?ids=artist-1')) {
        return jsonResponse({
          artists: [
            {
              id: 'artist-1',
              name: 'The Loopers',
              genres: ['dream pop', 'art pop'],
              popularity: 42,
              images: [{ url: '/artist.jpg' }],
            },
          ],
        });
      }
      return jsonResponse({});
    }));

    const taste = await getSpotifyTasteProfile();

    expect(taste.topGenres).toEqual([
      { name: 'art pop', count: 1 },
      { name: 'dream pop', count: 1 },
    ]);
    expect(taste.metrics.find((metric) => metric.label === 'Genre focus')?.value).toBe('100%');
    expect(taste.metrics.find((metric) => metric.label === 'Niche score')?.value).toBe('49%');
    expect(taste.topArtists[0]).toMatchObject({
      name: 'The Loopers',
      genres: ['dream pop', 'art pop'],
      popularity: 42,
    });
  });

  it('infers top genre when Spotify artist genres are empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/me/top/artists')) {
        return jsonResponse({ items: [] });
      }
      if (url.includes('/me/top/tracks')) {
        return jsonResponse({ items: [] });
      }
      if (url.includes('/me/tracks')) {
        return jsonResponse({
          total: 2,
          items: [
            { track: spotifyTrack('track-1', 'Oblivion', 'artist-grimes', 'Grimes') },
            { track: spotifyTrack('track-2', 'Heaven or Las Vegas', 'artist-cocteau', 'Cocteau Twins') },
          ],
          next: null,
        });
      }
      if (url.includes('/me/player/recently-played')) {
        return jsonResponse({ items: [{ track: spotifyTrack('track-3', 'Genesis', 'artist-grimes', 'Grimes') }] });
      }
      if (url.includes('/artists?ids=')) {
        return jsonResponse({
          artists: [
            { id: 'artist-grimes', name: 'Grimes', genres: [], popularity: 64, images: [] },
            { id: 'artist-cocteau', name: 'Cocteau Twins', genres: [], popularity: 56, images: [] },
          ],
        });
      }
      return jsonResponse({});
    }));

    const taste = await getSpotifyTasteProfile();

    expect(taste.topGenres.map((genre) => genre.name)).toContain('art pop');
    expect(taste.topGenres.map((genre) => genre.name)).toContain('dream pop');
    expect(taste.metrics.find((metric) => metric.label === 'Genre focus')?.value).not.toBe('0%');
  });

  it('weighs a single very recent play over several plays from days ago', async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/me/top/artists')) return jsonResponse({ items: [] });
      if (url.includes('/me/top/tracks')) return jsonResponse({ items: [] });
      if (url.includes('/me/tracks')) return jsonResponse({ total: 0, items: [], next: null });
      if (url.includes('/me/player/recently-played')) {
        return jsonResponse({
          items: [
            // One play, seconds ago.
            { track: spotifyTrack('track-new', 'Right Now', 'artist-new', 'Fresh Signal'), played_at: hoursAgo(0) },
            // Three plays, four days ago each — would win on raw frequency alone.
            { track: spotifyTrack('track-old-1', 'Old Loop A', 'artist-old', 'Stale Rotation'), played_at: hoursAgo(96) },
            { track: spotifyTrack('track-old-2', 'Old Loop B', 'artist-old', 'Stale Rotation'), played_at: hoursAgo(96) },
            { track: spotifyTrack('track-old-3', 'Old Loop C', 'artist-old', 'Stale Rotation'), played_at: hoursAgo(96) },
          ],
        });
      }
      if (url.includes('/artists?ids=')) {
        return jsonResponse({
          artists: [
            { id: 'artist-new', name: 'Fresh Signal', genres: [], popularity: 50, images: [] },
            { id: 'artist-old', name: 'Stale Rotation', genres: [], popularity: 50, images: [] },
          ],
        });
      }
      return jsonResponse({});
    }));

    const taste = await getSpotifyTasteProfile();

    expect(taste.recentArtists[0]?.name).toBe('Fresh Signal');
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function spotifyTrack(id: string, name: string, artistId: string, artistName: string) {
  return {
    id,
    uri: `spotify:track:${id}`,
    name,
    popularity: 55,
    artists: [{ id: artistId, name: artistName }],
    album: {
      name: 'Loop Deluxe',
      images: [{ url: '/cover.jpg' }],
    },
  };
}
