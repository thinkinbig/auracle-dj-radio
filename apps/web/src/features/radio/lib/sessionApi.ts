import type { CreateSessionResponse, HostMode, SessionIntent } from '@auracle/shared';
import { clearStoredToken, jsonAuthHeaders } from '@/features/marketing/authApi';
import { DEMO_SESSION } from '@/data/demoData';

export class SessionAuthError extends Error {
  constructor() {
    super('Session authentication expired');
    this.name = 'SessionAuthError';
  }
}

export async function createSession(intent: SessionIntent): Promise<CreateSessionResponse> {
  try {
    const res = await fetch('/sessions', {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify(intent),
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, payload }),
  }).catch(() => {});
}

/** Mirror the playhead to memory-service so replan/cues target the right track. */
export function postNowPlaying(sessionId: string, trackId: string): void {
  void fetch(`/sessions/${sessionId}/now_playing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId }),
  }).catch(() => {});
}

/** Ask memory-service to push an end-of-track DJ cue (Lane 3). */
export function postCue(sessionId: string, kind: 'break' | 'outro'): void {
  void fetch(`/sessions/${sessionId}/cue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind }),
  }).catch(() => {});
}

export async function postHostMode(sessionId: string, hostMode: HostMode): Promise<boolean> {
  try {
    const res = await fetch(`/sessions/${sessionId}/host-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_mode: hostMode }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
