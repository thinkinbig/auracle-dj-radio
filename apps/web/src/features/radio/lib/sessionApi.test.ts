import { describe, expect, it, vi } from 'vitest';
import type { SessionIntent, TrackSeed } from '@auracle/shared';
import { createSpotifyFallbackSession } from './sessionApi';

const intent: SessionIntent = {
  mood: 'focus',
  scene: 'writing',
  duration_min: 25,
};

function seed(n: number): TrackSeed {
  return {
    uri: `spotify:track:${n}`,
    title: `Spotify Song ${n}`,
    artist: `Artist ${n}`,
    albumTitle: `Album ${n}`,
    albumCoverUrl: `https://img/${n}.jpg`,
    durationSec: 180 + n,
  };
}

describe('createSpotifyFallbackSession', () => {
  it('keeps Spotify seeds as the active playback source when the session API is unavailable', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_783_627_200_000);

    const session = createSpotifyFallbackSession(intent, [seed(1), seed(2)]);

    expect(session.session_id).toBe('spotify-fallback-1783627200000');
    expect(session.session_title).toBe('Spotify Radio');
    expect(session.session_subtitle).toBe('25 min · writing');
    expect(session.tracklist).toHaveLength(2);
    expect(session.tracklist.every((track) => track.uri.startsWith('spotify:'))).toBe(true);
    expect(session.tracklist[0]).toMatchObject({
      id: 'spotify:track:1',
      uri: 'spotify:track:1',
      title: 'Spotify Song 1',
      artist: 'Artist 1',
      albumTitle: 'Album 1',
      albumCoverUrl: 'https://img/1.jpg',
      durationSec: 181,
    });
  });
});
