import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotifyPlaybackSnapshot } from '@/features/spotify/spotifyPlayback';
import type { MusicPlayerCallbacks, PlayableTrack } from './MusicPlayer';

// SpotifyPlayer's transport is mocked: these tests exercise the runtime
// skip-forward watchdog (#76), not the real Web Playback SDK.
const playSpotifyUri = vi.fn<(uri: string) => Promise<boolean>>();
const getSpotifyPlaybackSnapshot = vi.fn<() => Promise<SpotifyPlaybackSnapshot | null>>();

vi.mock('@/features/spotify/spotifyPlayback', () => ({
  playSpotifyUri: (uri: string) => playSpotifyUri(uri),
  getSpotifyPlaybackSnapshot: () => getSpotifyPlaybackSnapshot(),
  pauseSpotifyPlayback: vi.fn(() => Promise.resolve()),
  resumeSpotifyPlayback: vi.fn(() => Promise.resolve()),
  setSpotifyVolume: vi.fn(() => Promise.resolve()),
}));

const { createSpotifyPlayer } = await import('./SpotifyPlayer');

const URI = 'spotify:track:abc';

function track(): PlayableTrack {
  return { id: URI, source: 'spotify', spotify: { uri: URI, title: 't', artist: 'a', albumTitle: 'al', albumCoverUrl: '', durationSec: 200 } };
}

function snapshot(over: Partial<SpotifyPlaybackSnapshot> = {}): SpotifyPlaybackSnapshot {
  return { uri: URI, progressMs: 1000, durationMs: 200_000, paused: false, ...over };
}

function makeCallbacks(): MusicPlayerCallbacks & { onEnded: ReturnType<typeof vi.fn> } {
  return { onProgress: vi.fn(), onDuration: vi.fn(), onEnded: vi.fn() };
}

describe('createSpotifyPlayer runtime skip-forward (#76)', () => {
  beforeEach(() => {
    // node env has no `window`; the player reaches timers through it.
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
    playSpotifyUri.mockResolvedValue(true);
    getSpotifyPlaybackSnapshot.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('skips forward when the device never reports our uri within the timeout', async () => {
    const cb = makeCallbacks();
    const player = createSpotifyPlayer(cb);

    player.load(track(), { autostart: true });
    expect(playSpotifyUri).toHaveBeenCalledWith(URI);
    expect(cb.onEnded).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(cb.onEnded).toHaveBeenCalledTimes(1);
  });

  it('fails fast (before the timeout) when the play request is rejected', async () => {
    playSpotifyUri.mockResolvedValue(false);
    const cb = makeCallbacks();
    const player = createSpotifyPlayer(cb);

    player.load(track(), { autostart: true });
    // Resolve the rejected play promise without advancing past the watchdog window.
    await vi.advanceTimersByTimeAsync(50);
    expect(cb.onEnded).toHaveBeenCalledTimes(1);
  });

  it('does not skip forward once the device confirms our uri is playing', async () => {
    getSpotifyPlaybackSnapshot.mockResolvedValue(snapshot());
    const cb = makeCallbacks();
    const player = createSpotifyPlayer(cb);

    player.load(track(), { autostart: true });
    // One poll confirms the uri; the watchdog stands down even past its timeout.
    await vi.advanceTimersByTimeAsync(6000);
    expect(cb.onEnded).not.toHaveBeenCalled();
  });

  it('still synthesizes a natural end at the tail of a confirmed track', async () => {
    getSpotifyPlaybackSnapshot.mockResolvedValue(snapshot({ progressMs: 199_500, durationMs: 200_000 }));
    const cb = makeCallbacks();
    const player = createSpotifyPlayer(cb);

    player.load(track(), { autostart: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb.onEnded).toHaveBeenCalledTimes(1);
  });

  it('does not arm the watchdog while the opening gate holds track 0 (autostart:false)', async () => {
    const cb = makeCallbacks();
    const player = createSpotifyPlayer(cb);

    player.load(track(), { autostart: false });
    expect(playSpotifyUri).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6000);
    expect(cb.onEnded).not.toHaveBeenCalled();

    // Releasing the gate starts playback and arms the watchdog from there.
    player.resume();
    expect(playSpotifyUri).toHaveBeenCalledWith(URI);
    await vi.advanceTimersByTimeAsync(5000);
    expect(cb.onEnded).toHaveBeenCalledTimes(1);
  });

  it('cancels the watchdog on pause so a paused start is not skipped', async () => {
    const cb = makeCallbacks();
    const player = createSpotifyPlayer(cb);

    player.load(track(), { autostart: true });
    player.pause();
    await vi.advanceTimersByTimeAsync(6000);
    expect(cb.onEnded).not.toHaveBeenCalled();
  });
});
