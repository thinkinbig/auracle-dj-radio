import type { EventsStore, SessionEventRow } from "./events-db.js";

type EventFilter = { sessionId?: string; userId?: string; eventType?: string; limit?: number };
type Fetch = typeof fetch;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function payloadValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

async function dataApiError(response: Response): Promise<Error> {
  const body = await response.text();
  return new Error(`Supabase Data API ${response.status}: ${body || response.statusText}`);
}

/**
 * Event store backed by Supabase's HTTP Data API. It intentionally does not
 * open a Postgres wire connection or maintain an application-side pool.
 */
export class SupabaseEventsStore implements EventsStore {
  private readonly endpoint: string;

  constructor(
    supabaseUrl: string,
    private readonly secretKey: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.endpoint = `${trimTrailingSlash(supabaseUrl)}/rest/v1/session_events`;
  }

  private headers(extra: Record<string, string> = {}): Headers {
    const headers = new Headers(extra);
    // A secret key is accepted only by Supabase's API gateway. It is never
    // forwarded to a browser, and the gateway maps it to service_role.
    headers.set("apikey", this.secretKey);
    return headers;
  }

  async verifySchema(): Promise<void> {
    const url = new URL(this.endpoint);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "1");
    const response = await this.fetchImpl(url, { headers: this.headers() });
    if (!response.ok) throw await dataApiError(response);
  }

  async recordEvent(sessionId: string, userId: string, eventType: string, payload: unknown): Promise<void> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json", prefer: "return=minimal" }),
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        ts: Date.now(),
        event_type: eventType,
        payload_json: payload ?? {},
      }),
    });
    if (!response.ok) throw await dataApiError(response);
  }

  async queryEvents(filter: EventFilter): Promise<SessionEventRow[]> {
    const url = new URL(this.endpoint);
    url.searchParams.set("select", "id,session_id,user_id,ts,event_type,payload_json");
    url.searchParams.set("order", "id.asc");
    url.searchParams.set("limit", String(filter.limit && filter.limit > 0 ? Math.min(filter.limit, 2000) : 500));
    if (filter.sessionId) url.searchParams.set("session_id", `eq.${filter.sessionId}`);
    if (filter.userId) url.searchParams.set("user_id", `eq.${filter.userId}`);
    if (filter.eventType) url.searchParams.set("event_type", `eq.${filter.eventType}`);
    if (!filter.sessionId && !filter.userId && !filter.eventType) {
      throw new Error("queryEvents requires at least one filter");
    }

    const response = await this.fetchImpl(url, { headers: this.headers() });
    if (!response.ok) throw await dataApiError(response);
    const rows = (await response.json()) as Array<{
      id: string | number;
      session_id: string;
      user_id: string;
      ts: string | number;
      event_type: string;
      payload_json: unknown;
    }>;
    return rows.map((row) => ({
      id: Number(row.id),
      session_id: row.session_id,
      user_id: row.user_id,
      ts: Number(row.ts),
      event_type: row.event_type,
      payload: payloadValue(row.payload_json),
    }));
  }

  async countEvents(sessionId: string): Promise<number> {
    const url = new URL(this.endpoint);
    url.searchParams.set("session_id", `eq.${sessionId}`);
    url.searchParams.set("select", "id");
    const response = await this.fetchImpl(url, {
      headers: this.headers({ prefer: "count=exact" }),
    });
    if (!response.ok) throw await dataApiError(response);
    const total = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    return Number(total ?? 0);
  }

  async close(): Promise<void> {
    // The Data API is stateless; no TCP database client needs closing.
  }
}
