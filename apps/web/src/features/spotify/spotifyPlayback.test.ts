import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clearSpotifyConnection = vi.fn();
const getSpotifyAuthConfig = vi.fn(() => 'supabase');
const getValidSpotifyAccessToken = vi.fn(async () => 'spotify-token');
const hasSpotifySession = vi.fn(() => true);

vi.mock('./spotifyAuth', () => ({
  beginSpotifyLogin: vi.fn(),
  clearSpotifyConnection: () => clearSpotifyConnection(),
  getSpotifyAuthConfig: () => getSpotifyAuthConfig(),
  getValidSpotifyAccessToken: () => getValidSpotifyAccessToken(),
  hasSpotifySession: () => hasSpotifySession(),
}));

vi.mock('@/shared/query/queryClient', () => ({
  refreshSpotifyTasteQuery: vi.fn(),
}));

type Listener = (payload: never) => void;
let autoReady = true;

class MockSpotifyPlayer {
  listeners = new Map<string, Listener>();

  connect = vi.fn(async () => {
    if (autoReady) this.listeners.get('ready')?.({ device_id: 'device-1' } as never);
    return true;
  });

  disconnect = vi.fn();
  pause = vi.fn(async () => {});
  resume = vi.fn(async () => {});
  setVolume = vi.fn(async () => {});
  getCurrentState = vi.fn(async () => null);

  addListener(event: string, cb: Listener): boolean {
    this.listeners.set(event, cb);
    return true;
  }
}

let player: MockSpotifyPlayer;

function installBrowser() {
  const storage = new Map<string, string>();
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    Spotify: {
      Player: class {
        constructor() {
          player = new MockSpotifyPlayer();
          return player;
        }
      },
    },
  });
}

async function loadPlayback() {
  vi.resetModules();
  return import('./spotifyPlayback');
}

describe('spotifyPlayback SDK error handling', () => {
  beforeEach(() => {
    autoReady = true;
    installBrowser();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ product: 'premium' }),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not mark Spotify disconnected when the SDK reports an empty player queue', async () => {
    const { connectSpotifyPlayback, getSpotifyPlaybackState } = await loadPlayback();

    await connectSpotifyPlayback();
    player.listeners.get('playback_error')?.({ message: 'Cannot perform operation; no list was loaded.' } as never);

    expect(getSpotifyPlaybackState()).toMatchObject({
      enabled: true,
      playerStatus: 'ready',
      deviceId: 'device-1',
      error: null,
    });
  });

  it('keeps real SDK playback errors visible', async () => {
    const { connectSpotifyPlayback, getSpotifyPlaybackState } = await loadPlayback();

    await connectSpotifyPlayback();
    player.listeners.get('playback_error')?.({ message: 'Track unavailable' } as never);

    expect(getSpotifyPlaybackState()).toMatchObject({
      playerStatus: 'error',
      error: 'Track unavailable',
    });
  });

  it('gathers Spotify candidates without requiring Premium playback first', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/me/tracks')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                track: {
                  id: 'track-1',
                  uri: 'spotify:track:1',
                  name: 'Real Song',
                  duration_ms: 181_000,
                  is_playable: true,
                  artists: [{ name: 'Real Artist' }],
                  album: { name: 'Real Album', images: [{ url: '/cover.jpg' }] },
                },
              },
            ],
          }),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { gatherSpotifyCandidates, setSpotifyPlaybackEnabled } = await loadPlayback();

    setSpotifyPlaybackEnabled(true);
    const seeds = await gatherSpotifyCandidates();

    expect(seeds).toEqual([
      {
        uri: 'spotify:track:1',
        title: 'Real Song',
        artist: 'Real Artist',
        albumTitle: 'Real Album',
        albumCoverUrl: '/cover.jpg',
        durationSec: 181,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits for the Spotify device id before sending the play request', async () => {
    autoReady = false;
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: url.includes('/me/player/play') ? 204 : 200,
      json: async () => ({ product: 'premium' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { playSpotifyUri, setSpotifyPlaybackEnabled } = await loadPlayback();

    setSpotifyPlaybackEnabled(true);
    const playing = playSpotifyUri('spotify:track:late-device');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/me/player/play'),
      expect.anything(),
    );

    player.listeners.get('ready')?.({ device_id: 'late-device' } as never);
    await expect(playing).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('device_id=late-device'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
