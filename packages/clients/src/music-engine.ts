import type { FlowResult, SessionIntent, TastePreference, TrackCandidate, TrackMeta, TrackSeed } from "@auracle/shared";

export interface PlanTracklistRequest {
  intent: SessionIntent;
  mode?: "provisional" | "full" | "replan" | "extend";
  memories?: string;
  /** Externally-seeded candidates (e.g. the listener's Spotify library). When present, they are the active source; music-engine resolves their energy + voicing internally on `full`. */
  seeds?: TrackSeed[];
  /** Energy-level skip weights (1–5 → 0–0.7) from user history; passed to retrieval scoring. */
  energyWeights?: Partial<Record<number, number>>;
  /** Structured taste prefer/avoid (Epic #3, S4); passed to retrieval weighting. */
  taste?: TastePreference[];
  tieBreakSeed?: string;
  replan?: {
    playedIds?: string[];
    played?: TrackCandidate[];
    lastPlayedEnergy?: number | null;
    remainingSlots?: number;
    /** Currently-shown remaining ids to steer away from on a Regenerate re-roll. */
    avoidIds?: string[];
  };
  /** Rolling extend (E1): append fresh tracks, excluding already-played/queued ids. */
  extend?: {
    playedIds?: string[];
    appendSlots?: number;
    lastPlayedEnergy?: number | null;
  };
}

export interface PlanResponse {
  result: FlowResult;
  /** Opaque to profile-service — recorded for analytics, never interpreted. */
  violations: unknown[];
  candidates: TrackCandidate[];
}

export interface SearchCatalogRequest {
  mood: string;
  scene: string;
  excludeIds?: string[];
  limit?: number;
  tieBreakSeed?: string;
}

/** HTTP client facade for music-engine, injected so orchestration tests do not need a live service. */
export interface MusicEngineClient {
  planTracklist(req: PlanTracklistRequest): Promise<PlanResponse>;
  searchCatalog(req: SearchCatalogRequest): Promise<{ candidates: TrackCandidate[] }>;
  getTrack(id: string): Promise<TrackMeta | undefined>;
}

/** HTTP-backed client used in the running service. */
export class HttpMusicEngineClient implements MusicEngineClient {
  constructor(private readonly baseUrl: string) {}

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`music-engine ${path}: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  planTracklist(req: PlanTracklistRequest): Promise<PlanResponse> {
    return this.postJson<PlanResponse>("/plan_tracklist", req);
  }

  searchCatalog(req: SearchCatalogRequest): Promise<{ candidates: TrackCandidate[] }> {
    return this.postJson<{ candidates: TrackCandidate[] }>("/search_catalog", req);
  }

  async getTrack(id: string): Promise<TrackMeta | undefined> {
    const res = await fetch(`${this.baseUrl}/tracks/${encodeURIComponent(id)}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`music-engine /tracks/${id}: ${res.status}`);
    return (await res.json()) as TrackMeta;
  }
}
