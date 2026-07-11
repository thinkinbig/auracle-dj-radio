import Database from "better-sqlite3";
import { ANONYMOUS_USER_ID } from "@auracle/shared";

// Profile-service owns the analytics event log. Every tool side-effect and
// lifecycle event flows through here; transcripts live in the Go side-channel
// and are joined offline by session_id (refactor-three-services).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS session_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL DEFAULT '${ANONYMOUS_USER_ID}',
  ts          INTEGER NOT NULL,
  event_type  TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
`;

/** One persisted event, payload parsed back from JSON (raw string kept on parse failure). */
export interface SessionEventRow {
  id: number;
  session_id: string;
  user_id: string;
  ts: number;
  event_type: string;
  payload: unknown;
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return { raw: json };
  }
}

export interface EventsStore {
  recordEvent(sessionId: string, userId: string, eventType: string, payload: unknown): void | Promise<void>;
  queryEvents(filter: { sessionId?: string; userId?: string; eventType?: string; limit?: number }): SessionEventRow[] | Promise<SessionEventRow[]>;
  countEvents(sessionId: string): number | Promise<number>;
  close(): void | Promise<void>;
}

export class EventsDb implements EventsStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.migrate();
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_events_user ON session_events(user_id)");
  }

  recordEvent(sessionId: string, userId: string, eventType: string, payload: unknown): void {
    this.db
      .prepare(`INSERT INTO session_events (session_id, user_id, ts, event_type, payload_json) VALUES (?, ?, ?, ?, ?)`)
      .run(sessionId, userId, Date.now(), eventType, JSON.stringify(payload ?? {}));
  }

  /**
   * Read events for offline eval scripts (#66): filter by any combination of
   * session, user, and event type; ordered by insertion (id). The caller must
   * supply at least one filter — this is an analytics read, not a full dump.
   */
  queryEvents(filter: { sessionId?: string; userId?: string; eventType?: string; limit?: number }): SessionEventRow[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.sessionId) {
      where.push("session_id = ?");
      params.push(filter.sessionId);
    }
    if (filter.userId) {
      where.push("user_id = ?");
      params.push(filter.userId);
    }
    if (filter.eventType) {
      where.push("event_type = ?");
      params.push(filter.eventType);
    }
    if (where.length === 0) throw new Error("queryEvents requires at least one filter");
    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 2000) : 500;
    const rows = this.db
      .prepare(
        `SELECT id, session_id, user_id, ts, event_type, payload_json
         FROM session_events WHERE ${where.join(" AND ")} ORDER BY id LIMIT ?`,
      )
      .all(...params, limit) as { id: number; session_id: string; user_id: string; ts: number; event_type: string; payload_json: string }[];
    return rows.map((r) => ({
      id: r.id,
      session_id: r.session_id,
      user_id: r.user_id,
      ts: r.ts,
      event_type: r.event_type,
      payload: safeParse(r.payload_json),
    }));
  }

  /** Count events for a session (used by tests / analytics sanity). */
  countEvents(sessionId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM session_events WHERE session_id = ?`)
      .get(sessionId) as { c: number };
    return row.c;
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    const columns = this.db.prepare("PRAGMA table_info(session_events)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "user_id")) {
      this.db.exec(`ALTER TABLE session_events ADD COLUMN user_id TEXT NOT NULL DEFAULT '${ANONYMOUS_USER_ID}'`);
    }
  }
}
