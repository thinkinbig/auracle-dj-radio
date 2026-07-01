import { HarnessSessionClient, SessionAuthError } from '@auracle/clients';
import type { CreateSessionResponse, SessionIntent, TrackSeed } from '@auracle/shared';
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
): Promise<CreateSessionResponse> {
  try {
    const res = await fetch('/sessions', {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({
        ...intent,
        ...(seeds?.length ? { seeds } : {}),
        ...(spotifyTasteSummary ? { spotify_taste_summary: spotifyTasteSummary } : {}),
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
  return DEMO_SESSION;
}

export const postSessionEvent = client.postSessionEvent.bind(client);
export const extendSession = client.extendSession.bind(client);
export const postPlaylistFeedback = client.postPlaylistFeedback.bind(client);
export const postNowPlaying = client.postNowPlaying.bind(client);
export const postSkipTrack = client.postSkipTrack.bind(client);
export const postCue = client.postCue.bind(client);
export const postHostMode = client.postHostMode.bind(client);
