import Database from "better-sqlite3";
import { ANONYMOUS_USER_ID } from "@auracle/shared";

// Memory-service owns the analytics event log. Every tool side-effect and
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

export class EventsDb {
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

  /** Count events for a session (used by tests / analytics sanity). */
  countEvents(sessionId: string): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM session_events WHERE session_id = ?`)
      .get(sessionId) as { c: number };
    return row.c;
  }

  /**
   * Compute energy-level skip weights from the most recent `recentSessions` sessions.
   * Returns a map of energy (1–5) → penalty weight (0–0.7): 0 = never skipped,
   * 0.7 = heavily skipped. Each additional skip adds 0.15, capped at 0.7.
   * Used by music-engine to soft-downrank tracks at energies the user often skips.
   */
  skipRateByEnergy(userId: string, recentSessions: number): Partial<Record<number, number>> {
    const rows = this.db
      .prepare(
        `WITH recent AS (
           SELECT session_id FROM session_events
           WHERE user_id = ?
           GROUP BY session_id ORDER BY MIN(id) DESC LIMIT ?
         )
         SELECT CAST(json_extract(e.payload_json, '$.energy') AS INTEGER) AS energy,
                COUNT(*) AS skip_count
         FROM session_events e
         JOIN recent r ON e.session_id = r.session_id
         WHERE e.event_type = 'skip_latency'
           AND json_extract(e.payload_json, '$.energy') IS NOT NULL
         GROUP BY energy`,
      )
      .all(userId, recentSessions) as { energy: number; skip_count: number }[];

    const weights: Partial<Record<number, number>> = {};
    for (const { energy, skip_count } of rows) {
      weights[energy] = Math.min(0.7, skip_count * 0.15);
    }
    return weights;
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
