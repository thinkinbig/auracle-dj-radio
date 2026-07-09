import { HarnessSessionClient, SessionAuthError } from '@auracle/clients';
import type { CreateSessionResponse, SessionIntent, TastePreference, TrackSeed } from '@auracle/shared';
import { authHeaders, clearStoredToken, jsonAuthHeaders } from '@/features/marketing/authApi';
import { DEMO_SESSION } from '@/data/demoData';

export { SessionAuthError };

const client = new HarnessSessionClient({
  auth: {
    jsonHeaders: jsonAuthHeaders,
    authHeaders,
    clearToken: clearStoredToken,
  },
  createSessionFallback: DEMO_SESSION,
});

export async function createSession(
  intent: SessionIntent,
  seeds?: TrackSeed[],
  spotifyTasteSummary?: string,
  taste?: TastePreference[],
): Promise<CreateSessionResponse> {
  try {
    const res = await fetch('/sessions', {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        ...intent,
        ...(seeds?.length ? { seeds } : {}),
        ...(spotifyTasteSummary ? { spotify_taste_summary: spotifyTasteSummary } : {}),
        ...(taste?.length ? { taste } : {}),
      }),
    });
    if (res.status === 401) {
      clearStoredToken();
      throw new SessionAuthError();
    }
    if (res.ok) {
      const body = (await res.json()) as CreateSessionResponse;
      if (body.tracklist?.length) return body;
    }
  } catch (err) {
    if (err instanceof SessionAuthError) throw err;
  }
  if (seeds?.length) return createSpotifyFallbackSession(intent, seeds);
  return DEMO_SESSION;
}

export function createSpotifyFallbackSession(intent: SessionIntent, seeds: TrackSeed[]): CreateSessionResponse {
  const tracklist = seeds.slice(0, 8).map((seed, index) => ({
    id: seed.uri,
    uri: seed.uri,
    flow_position: index + 1,
    reason: index === 0 ? 'Spotify library opener' : 'Spotify library continuation',
    title: seed.title,
    artist: seed.artist,
    albumTitle: seed.albumTitle,
    albumCoverUrl: seed.albumCoverUrl,
    durationSec: seed.durationSec,
    energy: 3 as const,
    voicing: {
      artistPersona: '',
      albumConcept: seed.albumTitle,
      lore: `${seed.title} by ${seed.artist} from your connected Spotify library.`,
    },
  }));

  return {
    session_id: `spotify-fallback-${Date.now()}`,
    session_title: 'Spotify Radio',
    session_subtitle: `${intent.duration_min} min · ${intent.scene}`,
    host_mode: 'curator',
    tracklist,
    personalization_context: 'Spotify library fallback',
    proxy_url: '',
    token: '',
  };
}

export const postSessionEvent = client.postSessionEvent.bind(client);
export const extendSession = client.extendSession.bind(client);
export const postPlaylistFeedback = client.postPlaylistFeedback.bind(client);
export const postNowPlaying = client.postNowPlaying.bind(client);
export const postSkipTrack = client.postSkipTrack.bind(client);
export const postCue = client.postCue.bind(client);
export const postHostMode = client.postHostMode.bind(client);
