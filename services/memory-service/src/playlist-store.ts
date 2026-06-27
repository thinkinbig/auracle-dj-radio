import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
  ImportedPlaylistProfile,
  PlaylistImportRequest,
  PlaylistImportSource,
  PlaylistImportSummary,
  PlaylistImportTrack,
} from "@auracle/shared";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS imported_playlists (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  source      TEXT NOT NULL,
  track_count INTEGER NOT NULL,
  top_artists TEXT NOT NULL,
  top_genres  TEXT NOT NULL,
  year_start  INTEGER,
  year_end    INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS imported_playlist_tracks (
  playlist_id TEXT NOT NULL,
  position    INTEGER NOT NULL,
  title       TEXT NOT NULL,
  artist      TEXT NOT NULL,
  album       TEXT,
  genre       TEXT,
  year        INTEGER,
  mood_tags   TEXT NOT NULL,
  source_id   TEXT,
  PRIMARY KEY (playlist_id, position)
);

CREATE INDEX IF NOT EXISTS imported_playlists_user_created_idx
  ON imported_playlists(user_id, created_at DESC);
`;

interface PlaylistRow {
  id: string;
  name: string;
  source: PlaylistImportSource;
  track_count: number;
  top_artists: string;
  top_genres: string;
  year_start: number | null;
  year_end: number | null;
  created_at: number;
}

export class PlaylistStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  create(userId: string, request: PlaylistImportRequest): ImportedPlaylistProfile {
    const id = randomUUID();
    const createdAt = Date.now();
    const summary = summarizeTracks(request.tracks);
    const profile: ImportedPlaylistProfile = {
      id,
      name: request.name.trim(),
      source: request.source,
      trackCount: request.tracks.length,
      summary,
      createdAt,
    };

    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO imported_playlists
           (id, user_id, name, source, track_count, top_artists, top_genres, year_start, year_end, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          userId,
          profile.name,
          profile.source,
          profile.trackCount,
          JSON.stringify(summary.topArtists),
          JSON.stringify(summary.topGenres),
          summary.yearStart ?? null,
          summary.yearEnd ?? null,
          createdAt,
        );

      const trackInsert = this.db.prepare(
        `INSERT INTO imported_playlist_tracks
         (playlist_id, position, title, artist, album, genre, year, mood_tags, source_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      request.tracks.forEach((track, index) => {
        trackInsert.run(
          id,
          index + 1,
          track.title.trim(),
          track.artist.trim(),
          cleanOptional(track.album),
          cleanOptional(track.genre),
          track.year ?? null,
          JSON.stringify(track.moodTags ?? []),
          cleanOptional(track.sourceId),
        );
      });
    });
    insert();
    return profile;
  }

  list(userId: string): ImportedPlaylistProfile[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, source, track_count, top_artists, top_genres, year_start, year_end, created_at
         FROM imported_playlists
         WHERE user_id = ?
         ORDER BY created_at DESC`,
      )
      .all(userId) as PlaylistRow[];
    return rows.map(rowToProfile);
  }

  close(): void {
    this.db.close();
  }
}

export function validatePlaylistImport(raw: unknown): PlaylistImportRequest | { error: string } {
  const body = (raw ?? {}) as Partial<PlaylistImportRequest>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { error: "playlist name is required" };
  if (name.length > 90) return { error: "playlist name is too long" };
  if (!["csv", "manual", "spotify_export"].includes(String(body.source))) {
    return { error: "playlist source is invalid" };
  }
  if (!Array.isArray(body.tracks) || body.tracks.length === 0) return { error: "at least one track is required" };
  if (body.tracks.length > 5000) return { error: "playlist imports are limited to 5000 tracks" };

  const tracks: PlaylistImportTrack[] = [];
  for (const rawTrack of body.tracks) {
    const t = (rawTrack ?? {}) as Partial<PlaylistImportTrack>;
    const title = typeof t.title === "string" ? t.title.trim() : "";
    const artist = typeof t.artist === "string" ? t.artist.trim() : "";
    if (!title || !artist) continue;
    const year = Number.isInteger(t.year) && t.year! >= 1900 && t.year! <= 2100 ? t.year : undefined;
    tracks.push({
      title: title.slice(0, 180),
      artist: artist.slice(0, 180),
      ...(cleanOptional(t.album) ? { album: cleanOptional(t.album) } : {}),
      ...(cleanOptional(t.genre) ? { genre: cleanOptional(t.genre) } : {}),
      ...(year ? { year } : {}),
      ...(Array.isArray(t.moodTags) ? { moodTags: t.moodTags.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 8) } : {}),
      ...(cleanOptional(t.sourceId) ? { sourceId: cleanOptional(t.sourceId) } : {}),
    });
  }
  if (tracks.length === 0) return { error: "no valid tracks found" };
  return { name, source: body.source as PlaylistImportSource, tracks };
}

export function summarizeTracks(tracks: PlaylistImportTrack[]): PlaylistImportSummary {
  const topArtists = topValues(tracks.map((track) => track.artist));
  const topGenres = topValues(tracks.map((track) => track.genre).filter((genre): genre is string => Boolean(genre)));
  const years = tracks.map((track) => track.year).filter((year): year is number => typeof year === "number");
  return {
    topArtists,
    topGenres,
    ...(years.length > 0 ? { yearStart: Math.min(...years), yearEnd: Math.max(...years) } : {}),
  };
}

export function playlistMemoryFact(profile: ImportedPlaylistProfile): string {
  const artists = profile.summary.topArtists.length ? profile.summary.topArtists.join(", ") : "mixed artists";
  const genres = profile.summary.topGenres.length ? `; genres: ${profile.summary.topGenres.join(", ")}` : "";
  const years =
    profile.summary.yearStart && profile.summary.yearEnd
      ? `; years: ${profile.summary.yearStart}-${profile.summary.yearEnd}`
      : "";
  return `Imported playlist "${profile.name}" has ${profile.trackCount} tracks; top artists: ${artists}${genres}${years}. Use it as long-term listener taste context.`;
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 180) : undefined;
}

function rowToProfile(row: PlaylistRow): ImportedPlaylistProfile {
  const summary: PlaylistImportSummary = {
    topArtists: parseStringArray(row.top_artists),
    topGenres: parseStringArray(row.top_genres),
    ...(row.year_start != null ? { yearStart: row.year_start } : {}),
    ...(row.year_end != null ? { yearEnd: row.year_end } : {}),
  };
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    trackCount: row.track_count,
    summary,
    createdAt: row.created_at,
  };
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function topValues(values: string[], limit = 6): string[] {
  const counts = new Map<string, { value: string; count: number }>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key) continue;
    const current = counts.get(key);
    counts.set(key, { value: current?.value ?? value.trim(), count: (current?.count ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit)
    .map((item) => item.value);
}
