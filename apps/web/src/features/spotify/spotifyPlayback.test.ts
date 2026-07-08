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

class MockSpotifyPlayer {
  listeners = new Map<string, Listener>();

  connect = vi.fn(async () => {
    this.listeners.get('ready')?.({ device_id: 'device-1' } as never);
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
});
