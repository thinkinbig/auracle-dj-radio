import Database from "better-sqlite3";

// Memory-service owns the analytics event log. Every tool side-effect and
// lifecycle event flows through here; transcripts live in the Go side-channel
// and are joined offline by session_id (refactor-three-services).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS session_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  event_type  TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
`;

export class EventsDb {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  recordEvent(sessionId: string, eventType: string, payload: unknown): void {
    this.db
      .prepare(`INSERT INTO session_events (session_id, ts, event_type, payload_json) VALUES (?, ?, ?, ?)`)
      .run(sessionId, Date.now(), eventType, JSON.stringify(payload ?? {}));
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
}
