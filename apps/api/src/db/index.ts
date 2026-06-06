import Database from "better-sqlite3";
import type { Track, Energy } from "@auracle/shared";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tracks (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  artist         TEXT NOT NULL,
  energy         INTEGER NOT NULL,
  tempo          INTEGER NOT NULL,
  genre          TEXT NOT NULL,
  mood           TEXT NOT NULL,
  scene          TEXT NOT NULL,
  file_path      TEXT NOT NULL,
  intro_offset_ms INTEGER,
  embedding_json TEXT
);

CREATE TABLE IF NOT EXISTS session_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  event_type  TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
`;

/** A track plus its stored embedding vector (kept out of the shared Track type). */
export interface TrackRow extends Track {
  embedding: number[] | null;
}

interface RawTrackRow {
  id: string;
  title: string;
  artist: string;
  energy: number;
  tempo: number;
  genre: string;
  mood: string;
  scene: string;
  file_path: string;
  intro_offset_ms: number | null;
  embedding_json: string | null;
}

export class Db {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  upsertTrack(t: TrackRow): void {
    this.db
      .prepare(
        `INSERT INTO tracks (id, title, artist, energy, tempo, genre, mood, scene, file_path, intro_offset_ms, embedding_json)
         VALUES (@id, @title, @artist, @energy, @tempo, @genre, @mood, @scene, @file_path, @intro_offset_ms, @embedding_json)
         ON CONFLICT(id) DO UPDATE SET
           title=@title, artist=@artist, energy=@energy, tempo=@tempo, genre=@genre,
           mood=@mood, scene=@scene, file_path=@file_path, intro_offset_ms=@intro_offset_ms,
           embedding_json=@embedding_json`,
      )
      .run({
        id: t.id,
        title: t.title,
        artist: t.artist,
        energy: t.energy,
        tempo: t.tempo,
        genre: t.genre,
        mood: t.mood,
        scene: t.scene,
        file_path: t.filePath,
        intro_offset_ms: t.introOffsetMs,
        embedding_json: t.embedding ? JSON.stringify(t.embedding) : null,
      });
  }

  allTracks(): TrackRow[] {
    const rows = this.db.prepare(`SELECT * FROM tracks`).all() as RawTrackRow[];
    return rows.map(rowToTrack);
  }

  getTrack(id: string): TrackRow | undefined {
    const row = this.db.prepare(`SELECT * FROM tracks WHERE id = ?`).get(id) as RawTrackRow | undefined;
    return row ? rowToTrack(row) : undefined;
  }

  recordEvent(sessionId: string, eventType: string, payload: unknown): void {
    this.db
      .prepare(`INSERT INTO session_events (session_id, ts, event_type, payload_json) VALUES (?, ?, ?, ?)`)
      .run(sessionId, Date.now(), eventType, JSON.stringify(payload ?? {}));
  }

  close(): void {
    this.db.close();
  }
}

function rowToTrack(row: RawTrackRow): TrackRow {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    energy: row.energy as Energy,
    tempo: row.tempo,
    genre: row.genre,
    mood: row.mood,
    scene: row.scene,
    filePath: row.file_path,
    introOffsetMs: row.intro_offset_ms,
    embedding: row.embedding_json ? (JSON.parse(row.embedding_json) as number[]) : null,
  };
}
