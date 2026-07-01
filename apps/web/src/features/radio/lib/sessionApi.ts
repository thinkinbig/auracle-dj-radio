import { HarnessSessionClient, SessionAuthError } from '@auracle/clients';
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

export const createSession = client.createSession.bind(client);
export const postSessionEvent = client.postSessionEvent.bind(client);
export const extendSession = client.extendSession.bind(client);
export const postPlaylistFeedback = client.postPlaylistFeedback.bind(client);
export const postNowPlaying = client.postNowPlaying.bind(client);
export const postSkipTrack = client.postSkipTrack.bind(client);
export const postCue = client.postCue.bind(client);
export const postHostMode = client.postHostMode.bind(client);
