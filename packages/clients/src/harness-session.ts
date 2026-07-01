import type {
  CreateSessionResponse,
  HostMode,
  PlaylistFeedback,
  PlaylistFeedbackResponse,
  SessionIntent,
  TrackSeed,
} from "@auracle/shared";

export class SessionAuthError extends Error {
  constructor() {
    super("Session authentication expired");
    this.name = "SessionAuthError";
  }
}

/** Bearer token headers for harness session REST calls. */
export interface BearerAuth {
  jsonHeaders(): Record<string, string>;
  /** Bodyless POSTs — no Content-Type (Fastify rejects empty JSON bodies). */
  authHeaders(): Record<string, string>;
  clearToken(): void;
}

export interface HarnessSessionClientOptions {
  /** API origin; omit for same-origin relative paths in the browser. */
  baseUrl?: string;
  auth: BearerAuth;
  /** Returned when create fails on network / server errors (demo mode). */
  createSessionFallback?: CreateSessionResponse;
}

/** Browser (or test) client for agent-harness session REST. */
export class HarnessSessionClient {
  constructor(private readonly options: HarnessSessionClientOptions) {}

  private url(path: string): string {
    const base = this.options.baseUrl ?? "";
    return `${base}${path}`;
  }

  async createSession(
    intent: SessionIntent,
    seeds?: TrackSeed[],
  ): Promise<CreateSessionResponse> {
    const { auth, createSessionFallback } = this.options;
    try {
      const res = await fetch(this.url("/sessions"), {
        method: "POST",
        headers: auth.jsonHeaders(),
        body: JSON.stringify(seeds?.length ? { ...intent, seeds } : intent),
      });
      if (res.status === 401) {
        auth.clearToken();
        throw new SessionAuthError();
      }
      if (res.ok) {
        const body = (await res.json()) as CreateSessionResponse;
        if (body.tracklist?.length) return body;
      }
    } catch (err) {
      if (err instanceof SessionAuthError) throw err;
      /* demo fallback on network / server errors */
    }
    if (!createSessionFallback) {
      throw new Error("createSession failed and no fallback was configured");
    }
    return createSessionFallback;
  }

  postSessionEvent(sessionId: string, eventType: string, payload: Record<string, unknown>): void {
    void fetch(this.url(`/sessions/${sessionId}/events`), {
      method: "POST",
      headers: this.options.auth.jsonHeaders(),
      body: JSON.stringify({ event_type: eventType, payload }),
    }).catch(() => {});
  }

  /** Ask the harness to retry a failed rolling extend (E6). */
  async extendSession(sessionId: string): Promise<boolean> {
    try {
      const res = await fetch(this.url(`/sessions/${sessionId}/extend`), {
        method: "POST",
        headers: this.options.auth.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Record like / dislike / regenerate via the same server path as the DJ tool. */
  async postPlaylistFeedback(
    sessionId: string,
    feedback: PlaylistFeedback,
  ): Promise<PlaylistFeedbackResponse | undefined> {
    try {
      const res = await fetch(this.url(`/sessions/${sessionId}/playlist-feedback`), {
        method: "POST",
        headers: this.options.auth.jsonHeaders(),
        body: JSON.stringify({ feedback }),
      });
      if (!res.ok) return undefined;
      return (await res.json()) as PlaylistFeedbackResponse;
    } catch {
      return undefined;
    }
  }

  /** Mirror the playhead to memory-service so replan/cues target the right track. */
  postNowPlaying(sessionId: string, trackId: string): void {
    void fetch(this.url(`/sessions/${sessionId}/now_playing`), {
      method: "POST",
      headers: this.options.auth.jsonHeaders(),
      body: JSON.stringify({ track_id: trackId }),
    }).catch(() => {});
  }

  /** Record skip track via the same server path as the DJ tool. */
  postSkipTrack(sessionId: string, trackId: string): void {
    void fetch(this.url(`/sessions/${sessionId}/skip-track`), {
      method: "POST",
      headers: this.options.auth.jsonHeaders(),
      body: JSON.stringify({ track_id: trackId }),
    }).catch(() => {});
  }

  /** Ask memory-service to push an end-of-track DJ cue (Lane 3). */
  postCue(sessionId: string, kind: "break" | "outro"): void {
    void fetch(this.url(`/sessions/${sessionId}/cue`), {
      method: "POST",
      headers: this.options.auth.jsonHeaders(),
      body: JSON.stringify({ kind }),
    }).catch(() => {});
  }

  async postHostMode(sessionId: string, hostMode: HostMode): Promise<boolean> {
    try {
      const res = await fetch(this.url(`/sessions/${sessionId}/host-mode`), {
        method: "POST",
        headers: this.options.auth.jsonHeaders(),
        body: JSON.stringify({ host_mode: hostMode }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
