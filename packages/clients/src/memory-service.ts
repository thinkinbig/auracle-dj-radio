import { ANONYMOUS_USER_ID, type AuthUser, type TastePreference } from "@auracle/shared";

export type ResolveSessionUserResult =
  | { kind: "anonymous"; userId: string }
  | { kind: "authenticated"; userId: string }
  | { kind: "invalid_token" };

/** Like/dislike on the playing track, forwarded for taste derivation (#68/#69). */
export interface SessionTasteFeedbackRequest {
  sessionId: string;
  userId: string;
  trackId: string;
  feedback: "like" | "dislike";
  /** Persist the derived prefs + mem0 mirror (condition C, logged-in). */
  persist: boolean;
}

export interface MemoryServiceClient {
  recall(query: string, userId: string): Promise<string>;
  recallForIntent(userId: string, mood: string, scene: string): Promise<string>;
  remember(fact: string, sessionId: string, userId: string): Promise<void>;
  recordEvent(sessionId: string, userId: string, eventType: string, payload: unknown): Promise<void>;
  skipRateByEnergy(userId: string, recentSessions: number): Promise<Partial<Record<number, number>>>;
  /** A user's active structured taste prefs for plan weighting (Epic #3, S4). */
  tasteWeights(userId: string): Promise<TastePreference[]>;
  /**
   * Derive (and, for condition C logged-in users, persist) the taste prefs a
   * like/dislike rolls up to (#69). Returns the derived prefs — empty when the
   * track has no catalog identity — for the in-session queue nudge (#68).
   */
  sessionTasteFeedback(input: SessionTasteFeedbackRequest): Promise<TastePreference[]>;
  /** Map Bearer token → user id; no token → anonymous; bad token → invalid_token. Never throws. */
  resolveSessionUser(token?: string): Promise<ResolveSessionUserResult>;
}

export class HttpMemoryServiceClient implements MemoryServiceClient {
  constructor(private readonly baseUrl: string) {}

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`memory-service ${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async recall(query: string, userId: string): Promise<string> {
    const body = await this.postJson<{ memories: string }>("/memory/recall", { query, user_id: userId });
    return body.memories;
  }

  async recallForIntent(userId: string, mood: string, scene: string): Promise<string> {
    const body = await this.postJson<{ memories: string }>("/memory/recall-intent", {
      user_id: userId,
      mood,
      scene,
    });
    return body.memories;
  }

  async remember(fact: string, sessionId: string, userId: string): Promise<void> {
    await this.postJson<{ ok: true }>("/memory/remember", { fact, session_id: sessionId, user_id: userId });
  }

  async recordEvent(sessionId: string, userId: string, eventType: string, payload: unknown): Promise<void> {
    await this.postJson<{ ok: true }>("/events", { session_id: sessionId, user_id: userId, event_type: eventType, payload });
  }

  async skipRateByEnergy(userId: string, recentSessions: number): Promise<Partial<Record<number, number>>> {
    const body = await this.postJson<{ weights: Partial<Record<number, number>> }>("/events/skip-rate-by-energy", {
      user_id: userId,
      recent_sessions: recentSessions,
    });
    return body.weights;
  }

  async tasteWeights(userId: string): Promise<TastePreference[]> {
    const body = await this.postJson<{ preferences: TastePreference[] }>("/taste/weights", { user_id: userId });
    return body.preferences;
  }

  async sessionTasteFeedback(input: SessionTasteFeedbackRequest): Promise<TastePreference[]> {
    const body = await this.postJson<{ preferences: TastePreference[] }>("/taste/session-feedback", {
      session_id: input.sessionId,
      user_id: input.userId,
      track_id: input.trackId,
      feedback: input.feedback,
      persist: input.persist,
    });
    return body.preferences;
  }

  async resolveSessionUser(token?: string): Promise<ResolveSessionUserResult> {
    if (!token) return { kind: "anonymous", userId: ANONYMOUS_USER_ID };
    try {
      const res = await fetch(`${this.baseUrl}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) return { kind: "invalid_token" };
      const body = (await res.json()) as { user?: AuthUser };
      const userId = body.user?.id;
      if (!userId) return { kind: "invalid_token" };
      return { kind: "authenticated", userId };
    } catch {
      return { kind: "invalid_token" };
    }
  }
}
