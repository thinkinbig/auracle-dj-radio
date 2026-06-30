import type { CreateSessionResponse, HostMode, PlaylistFeedback, PlaylistFeedbackResponse, RegenerateSessionResponse, SessionIntent, SpotifyTrackRef } from '@auracle/shared';
import { authHeaders, clearStoredToken, jsonAuthHeaders } from '@/features/marketing/authApi';
import { DEMO_SESSION } from '@/data/demoData';

export class SessionAuthError extends Error {
  constructor() {
    super('Session authentication expired');
    this.name = 'SessionAuthError';
  }
}

export async function createSession(
  intent: SessionIntent,
  spotifyCandidates?: SpotifyTrackRef[],
): Promise<CreateSessionResponse> {
  try {
    const res = await fetch('/sessions', {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify(spotifyCandidates?.length ? { ...intent, spotifyCandidates } : intent),
    });
    if (res.status === 401) {
      clearStoredToken();
      throw new SessionAuthError();
    }
    if (res.ok) return (await res.json()) as CreateSessionResponse;
  } catch (err) {
    if (err instanceof SessionAuthError) throw err;
    /* demo fallback on network / server errors */
  }
  return DEMO_SESSION;
}

export function postSessionEvent(
  sessionId: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  void fetch(`/sessions/${sessionId}/events`, {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ event_type: eventType, payload }),
  }).catch(() => {});
}

/** Ask the harness to retry a failed rolling extend (E6). */
export async function extendSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`/sessions/${sessionId}/extend`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Record like / dislike / regenerate via the same server path as the DJ tool. */
export async function postPlaylistFeedback(
  sessionId: string,
  feedback: PlaylistFeedback,
): Promise<PlaylistFeedbackResponse | undefined> {
  try {
    const res = await fetch(`/sessions/${sessionId}/playlist-feedback`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ feedback }),
    });
    if (!res.ok) return undefined;
    return (await res.json()) as PlaylistFeedbackResponse;
  } catch {
    return undefined;
  }
}

/** Ask the harness to regenerate the not-yet-played queue for this session. */
export async function regenerateSession(sessionId: string): Promise<RegenerateSessionResponse | undefined> {
  const result = await postPlaylistFeedback(sessionId, 'regenerate');
  return result?.regenerate;
}

/** Mirror the playhead to memory-service so replan/cues target the right track. */
export function postNowPlaying(sessionId: string, trackId: string): void {
  void fetch(`/sessions/${sessionId}/now_playing`, {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ track_id: trackId }),
  }).catch(() => {});
}

/** Ask memory-service to push an end-of-track DJ cue (Lane 3). */
export function postCue(sessionId: string, kind: 'break' | 'outro'): void {
  void fetch(`/sessions/${sessionId}/cue`, {
    method: 'POST',
    headers: jsonAuthHeaders(),
    body: JSON.stringify({ kind }),
  }).catch(() => {});
}

export async function postHostMode(sessionId: string, hostMode: HostMode): Promise<boolean> {
  try {
    const res = await fetch(`/sessions/${sessionId}/host-mode`, {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ host_mode: hostMode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
