export interface MemoryServiceClient {
  recall(query: string): Promise<string>;
  remember(fact: string, sessionId: string): Promise<void>;
  recordEvent(sessionId: string, eventType: string, payload: unknown): Promise<void>;
  skipRateByEnergy(recentSessions: number): Promise<Partial<Record<number, number>>>;
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

  async recall(query: string): Promise<string> {
    const body = await this.postJson<{ memories: string }>("/memory/recall", { query });
    return body.memories;
  }

  async remember(fact: string, sessionId: string): Promise<void> {
    await this.postJson<{ ok: true }>("/memory/remember", { fact, session_id: sessionId });
  }

  async recordEvent(sessionId: string, eventType: string, payload: unknown): Promise<void> {
    await this.postJson<{ ok: true }>("/events", { session_id: sessionId, event_type: eventType, payload });
  }

  async skipRateByEnergy(recentSessions: number): Promise<Partial<Record<number, number>>> {
    const body = await this.postJson<{ weights: Partial<Record<number, number>> }>("/events/skip-rate-by-energy", {
      recent_sessions: recentSessions,
    });
    return body.weights;
  }
}
