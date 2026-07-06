import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./spotifyAuth', () => ({
  clearSpotifyToken: vi.fn(),
  getSpotifyConfig: vi.fn(() => ({ clientId: 'spotify-client', redirectUri: 'http://localhost/spotify/callback' })),
  getValidSpotifyAccessToken: vi.fn(async () => 'spotify-token'),
  hasSpotifyToken: vi.fn(() => true),
}));

import { getSuggestedScene } from './spotifyScene';

describe('getSuggestedScene', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks the scene with the most matching playlists', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/me/playlists')) {
        return jsonResponse({
          items: [
            { name: 'Study Session', description: 'deep focus for exams' },
            { name: 'Late Night Study', description: null },
            { name: 'Gym Hype', description: 'workout bangers' },
          ],
        });
      }
      return jsonResponse({});
    }));

    expect(await getSuggestedScene()).toBe('study');
  });

  it('returns undefined when no playlist names match a known scene', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/me/playlists')) {
        return jsonResponse({ items: [{ name: 'Untitled Playlist 3', description: null }] });
      }
      return jsonResponse({});
    }));

    expect(await getSuggestedScene()).toBeUndefined();
  });

  it('returns undefined when the Spotify request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, 500)));

    expect(await getSuggestedScene()).toBeUndefined();
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as Response;
}
