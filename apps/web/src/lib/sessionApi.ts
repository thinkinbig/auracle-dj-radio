import type { CreateSessionResponse, HostMode } from '@auracle/shared';
import { DEMO_SESSION } from '../mock/demoData';

export async function createSession(): Promise<CreateSessionResponse> {
  try {
    const res = await fetch('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood: 'calm', scene: 'study', duration_min: 25 }),
    });
    if (res.ok) return (await res.json()) as CreateSessionResponse;
  } catch {
    /* demo fallback */
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
