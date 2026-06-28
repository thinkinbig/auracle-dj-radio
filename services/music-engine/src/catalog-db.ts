import Database from "better-sqlite3";
import type { Track, Energy, TrackMeta } from "@auracle/shared";
import { toTrackMeta } from "./catalog/manifest.js";

// Catalog-only store: structured track metadata. Session analytics
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
  artist_persona  TEXT NOT NULL DEFAULT '',
  album_concept   TEXT NOT NULL DEFAULT '',
  album_cover_path TEXT NOT NULL DEFAULT '',
  artist_photo_path TEXT NOT NULL DEFAULT '',
  energy          INTEGER NOT NULL,
  tempo           INTEGER NOT NULL,
  genre           TEXT NOT NULL,
  genre_slug      TEXT NOT NULL DEFAULT '',
  artist_slug     TEXT NOT NULL DEFAULT '',
  album_slug      TEXT NOT NULL DEFAULT '',
  mood            TEXT NOT NULL,
  scene           TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  intro_offset_ms INTEGER
);
`;

// Additive columns for older DBs created before structured taste (S1). SQLite's
// CREATE TABLE IF NOT EXISTS won't add columns to an existing table, so add
// them here — never dropping or rewriting existing columns.
const ADDITIVE_COLUMNS: ReadonlyArray<[name: string, decl: string]> = [
  ["genre_slug", "TEXT NOT NULL DEFAULT ''"],
  ["artist_slug", "TEXT NOT NULL DEFAULT ''"],
  ["album_slug", "TEXT NOT NULL DEFAULT ''"],
  ["artist_persona", "TEXT NOT NULL DEFAULT ''"],
  ["album_concept", "TEXT NOT NULL DEFAULT ''"],
];

export type TrackRow = Track;

interface RawTrackRow {
  id: string;
  title: string;
  artist: string;
  artist_id: string;
  album_id: string;
  album_title: string;
  lore: string;
  artist_persona: string;
  album_concept: string;
  album_cover_path: string;
  artist_photo_path: string;
  energy: number;
  tempo: number;
  genre: string;
  genre_slug: string;
  artist_slug: string;
  album_slug: string;
  mood: string;
  scene: string;
  file_path: string;
  intro_offset_ms: number | null;
}

export class CatalogDb {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  /** Add structured-taste columns to pre-existing DBs (idempotent, additive). */
  private migrate(): void {
    const existing = new Set(
      (this.db.prepare(`PRAGMA table_info(tracks)`).all() as Array<{ name: string }>).map((r) => r.name),
    );
    for (const [name, decl] of ADDITIVE_COLUMNS) {
      if (!existing.has(name)) this.db.exec(`ALTER TABLE tracks ADD COLUMN ${name} ${decl}`);
    }
  }

  upsertTrack(t: TrackRow): void {
    this.db
      .prepare(
        `INSERT INTO tracks (
           id, title, artist, artist_id, album_id, album_title, lore, artist_persona, album_concept, album_cover_path, artist_photo_path,
           energy, tempo, genre, genre_slug, artist_slug, album_slug, mood, scene, file_path, intro_offset_ms
         )
         VALUES (
           @id, @title, @artist, @artist_id, @album_id, @album_title, @lore, @artist_persona, @album_concept, @album_cover_path, @artist_photo_path,
           @energy, @tempo, @genre, @genre_slug, @artist_slug, @album_slug, @mood, @scene, @file_path, @intro_offset_ms
         )
         ON CONFLICT(id) DO UPDATE SET
           title=@title, artist=@artist, artist_id=@artist_id, album_id=@album_id,
           album_title=@album_title, lore=@lore, artist_persona=@artist_persona, album_concept=@album_concept,
           album_cover_path=@album_cover_path, artist_photo_path=@artist_photo_path,
           energy=@energy, tempo=@tempo, genre=@genre, genre_slug=@genre_slug, artist_slug=@artist_slug, album_slug=@album_slug,
           mood=@mood, scene=@scene, file_path=@file_path, intro_offset_ms=@intro_offset_ms`,
      )
      .run({
        id: t.id,
        title: t.title,
        artist: t.artist,
        artist_id: t.artistId,
        album_id: t.albumId,
        album_title: t.albumTitle,
        lore: t.lore,
        artist_persona: t.artistPersona ?? "",
        album_concept: t.albumConcept ?? "",
        album_cover_path: t.albumCoverPath,
        artist_photo_path: t.artistPhotoPath,
        energy: t.energy,
        tempo: t.tempo,
        genre: t.genre,
        genre_slug: t.genreSlug,
        artist_slug: t.artistSlug,
        album_slug: t.albumSlug,
        mood: t.mood,
        scene: t.scene,
        file_path: t.filePath,
        intro_offset_ms: t.introOffsetMs,
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
    artistPersona: row.artist_persona ?? "",
    albumConcept: row.album_concept ?? "",
    albumCoverPath: row.album_cover_path ?? "",
    artistPhotoPath: row.artist_photo_path ?? "",
    energy: row.energy as Energy,
    tempo: row.tempo,
    genre: row.genre,
    genreSlug: row.genre_slug ?? "",
    artistSlug: row.artist_slug ?? "",
    albumSlug: row.album_slug ?? "",
    mood: row.mood,
    scene: row.scene,
    filePath: row.file_path,
    introOffsetMs: row.intro_offset_ms,
    instrumental: true,
  };
}
