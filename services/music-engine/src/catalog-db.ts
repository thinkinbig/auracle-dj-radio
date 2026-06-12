import Database from "better-sqlite3";
import type { Track, Energy, TrackMeta } from "@auracle/shared";
import { toTrackMeta } from "./catalog/manifest.js";

// Catalog-only store: tracks + their embedding vectors. Session analytics
// (session_events) belong to memory-service, not here (refactor-three-services).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS tracks (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  artist          TEXT NOT NULL,
  artist_id       TEXT NOT NULL DEFAULT '',
  album_id        TEXT NOT NULL DEFAULT '',
  album_title     TEXT NOT NULL DEFAULT '',
  lore            TEXT NOT NULL DEFAULT '',
  album_cover_path TEXT NOT NULL DEFAULT '',
  artist_photo_path TEXT NOT NULL DEFAULT '',
  energy          INTEGER NOT NULL,
  tempo           INTEGER NOT NULL,
  genre           TEXT NOT NULL,
  mood            TEXT NOT NULL,
  scene           TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  intro_offset_ms INTEGER,
  embedding_json  TEXT
);
`;

/** A track plus its stored embedding vector (kept out of the shared Track type). */
export interface TrackRow extends Track {
  embedding: number[] | null;
}

interface RawTrackRow {
  id: string;
  title: string;
  artist: string;
  artist_id: string;
  album_id: string;
  album_title: string;
  lore: string;
  album_cover_path: string;
  artist_photo_path: string;
  energy: number;
  tempo: number;
  genre: string;
  mood: string;
  scene: string;
  file_path: string;
  intro_offset_ms: number | null;
  embedding_json: string | null;
}

export class CatalogDb {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  upsertTrack(t: TrackRow): void {
    this.db
      .prepare(
        `INSERT INTO tracks (
           id, title, artist, artist_id, album_id, album_title, lore, album_cover_path, artist_photo_path,
           energy, tempo, genre, mood, scene, file_path, intro_offset_ms, embedding_json
         )
         VALUES (
           @id, @title, @artist, @artist_id, @album_id, @album_title, @lore, @album_cover_path, @artist_photo_path,
           @energy, @tempo, @genre, @mood, @scene, @file_path, @intro_offset_ms, @embedding_json
         )
         ON CONFLICT(id) DO UPDATE SET
           title=@title, artist=@artist, artist_id=@artist_id, album_id=@album_id,
           album_title=@album_title, lore=@lore, album_cover_path=@album_cover_path, artist_photo_path=@artist_photo_path,
           energy=@energy, tempo=@tempo, genre=@genre, mood=@mood, scene=@scene,
           file_path=@file_path, intro_offset_ms=@intro_offset_ms, embedding_json=@embedding_json`,
      )
      .run({
        id: t.id,
        title: t.title,
        artist: t.artist,
        artist_id: t.artistId,
        album_id: t.albumId,
        album_title: t.albumTitle,
        lore: t.lore,
        album_cover_path: t.albumCoverPath,
        artist_photo_path: t.artistPhotoPath,
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

  getTrackMeta(id: string): TrackMeta | undefined {
    const track = this.getTrack(id);
    return track ? toTrackMeta(track) : undefined;
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
    artistId: row.artist_id ?? "",
    albumId: row.album_id ?? "",
    albumTitle: row.album_title ?? "",
    lore: row.lore ?? "",
    albumCoverPath: row.album_cover_path ?? "",
    artistPhotoPath: row.artist_photo_path ?? "",
    energy: row.energy as Energy,
    tempo: row.tempo,
    genre: row.genre,
    mood: row.mood,
    scene: row.scene,
    filePath: row.file_path,
    introOffsetMs: row.intro_offset_ms,
    instrumental: true,
    embedding: row.embedding_json ? (JSON.parse(row.embedding_json) as number[]) : null,
  };
}
