import type { PlaylistImportSource, PlaylistImportTrack } from '@auracle/shared';

export interface ParsedPlaylist {
  tracks: PlaylistImportTrack[];
  warnings: string[];
}

type RawRow = Record<string, string>;

const HEADER_ALIASES = {
  title: ['title', 'track', 'track name', 'song', 'song name', 'name', 'master metadata track name'],
  artist: ['artist', 'artists', 'artist name', 'artist names', 'artist name(s)', 'album artist', 'master metadata album artist name'],
  album: ['album', 'album name', 'master metadata album album name'],
  genre: ['genre', 'genres'],
  year: ['year', 'release year', 'release date', 'date', 'added at', 'ts', 'played at'],
  moodTags: ['mood', 'moods', 'mood tags', 'tags'],
  sourceId: ['spotify uri', 'track uri', 'uri', 'spotify id', 'track id', 'id'],
} as const;

export function parsePlaylistInput(input: string, source: PlaylistImportSource): ParsedPlaylist {
  const text = input.trim();
  if (!text) return { tracks: [], warnings: ['Paste playlist metadata or upload a file.'] };

  const json = tryParseJson(text);
  if (json) return normalizeRows(json, source, 'json');

  const csvRows = parseDelimited(text);
  if (csvRows.length > 0 && hasUsefulHeader(csvRows[0]!)) {
    const [header, ...body] = csvRows;
    const rows = body.map((cells) => rowFromHeader(header!, cells));
    return normalizeRows(rows, source, 'csv');
  }

  return normalizeManualLines(text);
}

export function sourceLabel(source: PlaylistImportSource): string {
  if (source === 'spotify_export') return 'Spotify export';
  if (source === 'csv') return 'CSV';
  return 'Manual paste';
}

function tryParseJson(text: string): RawRow[] | undefined {
  if (!text.startsWith('{') && !text.startsWith('[')) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    const items = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed
        ? (parsed as { tracks?: unknown; items?: unknown }).tracks ?? (parsed as { items?: unknown }).items
        : undefined;
    if (!Array.isArray(items)) return undefined;
    return items.filter((item): item is RawRow => typeof item === 'object' && item !== null).map(flattenRow);
  } catch {
    return undefined;
  }
}

function flattenRow(row: RawRow): RawRow {
  const flattened: RawRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' || typeof value === 'number') flattened[normalizeKey(key)] = String(value);
    if (Array.isArray(value)) flattened[normalizeKey(key)] = value.map(String).join(', ');
  }
  return flattened;
}

function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseDelimitedLine(line, delimiter));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function hasUsefulHeader(cells: string[]): boolean {
  const keys = new Set(cells.map((cell) => normalizeKey(cell)));
  return aliasMatch(keys, HEADER_ALIASES.title) && aliasMatch(keys, HEADER_ALIASES.artist);
}

function rowFromHeader(header: string[], cells: string[]): RawRow {
  const row: RawRow = {};
  header.forEach((name, index) => {
    row[normalizeKey(name)] = cells[index] ?? '';
  });
  return row;
}

function normalizeRows(rows: RawRow[], source: PlaylistImportSource, format: 'csv' | 'json'): ParsedPlaylist {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const tracks: PlaylistImportTrack[] = [];

  for (const row of rows) {
    const title = pick(row, HEADER_ALIASES.title);
    const artist = pick(row, HEADER_ALIASES.artist);
    if (!title || !artist) continue;
    const key = `${title.toLowerCase()}::${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tracks.push({
      title,
      artist,
      ...(pick(row, HEADER_ALIASES.album) ? { album: pick(row, HEADER_ALIASES.album) } : {}),
      ...(pick(row, HEADER_ALIASES.genre) ? { genre: pick(row, HEADER_ALIASES.genre) } : {}),
      ...(parseYear(pick(row, HEADER_ALIASES.year)) ? { year: parseYear(pick(row, HEADER_ALIASES.year)) } : {}),
      ...(parseTags(pick(row, HEADER_ALIASES.moodTags)).length ? { moodTags: parseTags(pick(row, HEADER_ALIASES.moodTags)) } : {}),
      ...(pick(row, HEADER_ALIASES.sourceId) ? { sourceId: pick(row, HEADER_ALIASES.sourceId) } : {}),
    });
  }

  if (tracks.length === 0) warnings.push(`No valid tracks found in ${format === 'json' ? 'JSON' : sourceLabel(source)} metadata.`);
  if (rows.length > tracks.length) warnings.push(`${rows.length - tracks.length} rows were skipped or de-duplicated.`);
  return { tracks, warnings };
}

function normalizeManualLines(text: string): ParsedPlaylist {
  const warnings: string[] = [];
  const tracks: PlaylistImportTrack[] = [];
  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const cells = line.includes('\t') ? line.split('\t') : line.includes('|') ? line.split('|') : line.split(',');
    if (cells.length >= 2) {
      const [title, artist, album, genre, year] = cells.map((cell) => cell.trim());
      if (title && artist) {
        tracks.push({
          title,
          artist,
          ...(album ? { album } : {}),
          ...(genre ? { genre } : {}),
          ...(parseYear(year) ? { year: parseYear(year) } : {}),
        });
        continue;
      }
    }
    const dash = line.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dash?.[1] && dash[2]) {
      tracks.push({ title: dash[1].trim(), artist: dash[2].trim() });
      continue;
    }
    warnings.push(`Skipped "${line.slice(0, 48)}"`);
  }
  if (tracks.length === 0) warnings.push('Use one song per line: Title, Artist, Album, Genre, Year.');
  return { tracks, warnings };
}

function pick(row: RawRow, aliases: readonly string[]): string | undefined {
  for (const alias of aliases) {
    const value = row[normalizeKey(alias)];
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function aliasMatch(keys: Set<string>, aliases: readonly string[]): boolean {
  return aliases.some((alias) => keys.has(normalizeKey(alias)));
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseYear(value: string | undefined): number | undefined {
  const match = value?.match(/\b(19\d{2}|20\d{2}|2100)\b/);
  return match?.[1] ? Number(match[1]) : undefined;
}

function parseTags(value: string | undefined): string[] {
  return value?.split(/[;,|]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 8) ?? [];
}
