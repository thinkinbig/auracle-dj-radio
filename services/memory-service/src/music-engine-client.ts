import type { FlowResult, SessionIntent, TrackCandidate, TrackMeta } from "@auracle/shared";

export interface PlanTracklistRequest {
  intent: SessionIntent;
  mode?: "provisional" | "full" | "replan";
  memories?: string;
  /** Energy-level skip weights (1–5 → 0–0.7) from user history; passed to retrieval scoring. */
  energyWeights?: Partial<Record<number, number>>;
  replan?: {
    playedIds?: string[];
    played?: TrackCandidate[];
    lastPlayedEnergy?: number | null;
    remainingSlots?: number;
  };
}

export interface PlanResponse {
  result: FlowResult;
  /** Opaque to memory-service — recorded for analytics, never interpreted. */
  violations: unknown[];
  candidates: TrackCandidate[];
}

export interface SearchCatalogRequest {
  mood: string;
  scene: string;
  excludeIds?: string[];
  limit?: number;
}

/**
 * Memory-service's view of the music-engine. Injected so the orchestration is
 * testable without a live music-engine (refactor-three-services: Go→memory-service
 * is the only Gemini-facing path; memory-service→music-engine is internal HTTP).
 */
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
