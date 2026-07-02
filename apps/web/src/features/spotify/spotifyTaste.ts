import { clearSpotifyToken, getSpotifyConfig, getValidSpotifyAccessToken, hasSpotifyToken } from './spotifyAuth';

const API_BASE = 'https://api.spotify.com/v1';
const MAX_SAVED_TRACKS = 100;

export type SpotifyTasteStatus = 'missing_config' | 'signed_out' | 'ready';
export type SpotifyTasteRange = 'short_term' | 'medium_term' | 'long_term';

export interface SpotifyTasteArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number | null;
  imageUrl: string;
}

export interface SpotifyTasteTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  popularity: number | null;
  imageUrl: string;
  uri: string;
}

export interface SpotifyTasteMetric {
  label: string;
  value: string;
  detail: string;
}

export interface SpotifyTasteProfile {
  status: SpotifyTasteStatus;
  generatedAt: string;
  savedTrackCount: number;
  recentTrackCount: number;
  topArtists: SpotifyTasteArtist[];
  topTracks: SpotifyTasteTrack[];
  topGenres: Array<{ name: string; count: number }>;
  recentArtists: Array<{ name: string; count: number }>;
  metrics: SpotifyTasteMetric[];
  hostSeed: string;
  summary: string;
}

interface SpotifyImage {
  url: string;
  width?: number;
  height?: number;
}

interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[];
  popularity?: number;
  images?: SpotifyImage[];
}

interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  popularity?: number;
  artists: Array<{ id?: string; name: string }>;
  album: {
    name: string;
    images?: SpotifyImage[];
  };
}

interface SpotifyTopArtistsResponse {
  items: SpotifyArtist[];
}

interface SpotifyTopTracksResponse {
  items: SpotifyTrack[];
}

interface SpotifySavedTracksResponse {
  total?: number;
  items: Array<{ track: SpotifyTrack | null }>;
  next?: string | null;
}

interface SpotifyRecentlyPlayedResponse {
  items: Array<{ track: SpotifyTrack | null; played_at?: string }>;
}

export function canReadSpotifyTaste(): SpotifyTasteStatus {
  if (!getSpotifyConfig()) return 'missing_config';
  if (!hasSpotifyToken()) return 'signed_out';
  return 'ready';
}

export async function getSpotifyTasteProfile(): Promise<SpotifyTasteProfile> {
  const status = canReadSpotifyTaste();
  if (status !== 'ready') return emptyTasteProfile(status);

  const token = await requireTasteToken();
  const [artistsShort, artistsMedium, artistsLong, tracksMedium, saved, recent] = await Promise.all([
    fetchSpotify<SpotifyTopArtistsResponse>(token, `${API_BASE}/me/top/artists?limit=20&time_range=short_term`).catch(() => ({ items: [] })),
    fetchSpotify<SpotifyTopArtistsResponse>(token, `${API_BASE}/me/top/artists?limit=20&time_range=medium_term`).catch(() => ({ items: [] })),
    fetchSpotify<SpotifyTopArtistsResponse>(token, `${API_BASE}/me/top/artists?limit=20&time_range=long_term`).catch(() => ({ items: [] })),
    fetchSpotify<SpotifyTopTracksResponse>(token, `${API_BASE}/me/top/tracks?limit=20&time_range=medium_term&market=from_token`).catch(() => ({ items: [] })),
    fetchSavedTracks(token).catch(() => ({ total: 0, items: [] })),
    fetchSpotify<SpotifyRecentlyPlayedResponse>(token, `${API_BASE}/me/player/recently-played?limit=50`).catch(() => ({ items: [] })),
  ]);

  const savedTracks = saved.items.flatMap((item) => (item.track ? [item.track] : []));
  const recentTracks = recent.items.flatMap((item) => (item.track ? [item.track] : []));
  if (!hasSpotifyToken()) return emptyTasteProfile('signed_out');

  const spotifyTopArtists = mergeArtists(artistsShort.items, artistsMedium.items, artistsLong.items);
  const tracks = firstNonEmpty(
    tracksMedium.items,
    uniqueTracks(savedTracks),
    uniqueTracks(recentTracks),
  ).map(toTasteTrack).filter((track): track is SpotifyTasteTrack => Boolean(track));
  const artists = spotifyTopArtists.length > 0
    ? spotifyTopArtists
    : artistsFromTracks([...recentTracks, ...savedTracks]);
  const topGenres = rankCounts(countGenres(artists));
  const recentArtists = rankCounts(countTrackArtists(firstNonEmpty(recentTracks, savedTracks))).slice(0, 6);
  const metrics = buildMetrics({ artists, tracks, savedTracks, topGenres, recentArtists });
  const hostSeed = buildHostSeed({ topGenres, artists, tracks, recentArtists });
  const summary = buildSummary({ topGenres, artists, tracks, recentArtists, metrics });

  return {
    status: 'ready',
    generatedAt: new Date().toISOString(),
    savedTrackCount: saved.total ?? savedTracks.length,
    recentTrackCount: recentTracks.length,
    topArtists: artists.slice(0, 8),
    topTracks: tracks.slice(0, 8),
    topGenres: topGenres.slice(0, 10),
    recentArtists,
    metrics,
    hostSeed,
    summary,
  };
}

export function buildSpotifyTasteMemory(profile: SpotifyTasteProfile | undefined): string | undefined {
  if (!profile || profile.status !== 'ready') return undefined;
  const genres = profile.topGenres.slice(0, 5).map((g) => g.name).join(', ');
  const artists = profile.topArtists.slice(0, 5).map((a) => a.name).join(', ');
  const tracks = profile.topTracks.slice(0, 3).map((t) => `${t.name} by ${t.artist}`).join('; ');
  const metrics = profile.metrics.map((m) => `${m.label}: ${m.value}`).join(', ');
  return [
    'Spotify-derived Auracle taste summary:',
    genres ? `Top genres: ${genres}.` : '',
    artists ? `Top artists: ${artists}.` : '',
    tracks ? `Representative tracks: ${tracks}.` : '',
    metrics ? `Taste signals: ${metrics}.` : '',
    profile.hostSeed ? `AI host seed: ${profile.hostSeed}.` : '',
  ].filter(Boolean).join(' ').slice(0, 900);
}

function emptyTasteProfile(status: SpotifyTasteStatus): SpotifyTasteProfile {
  return {
    status,
    generatedAt: new Date().toISOString(),
    savedTrackCount: 0,
    recentTrackCount: 0,
    topArtists: [],
    topTracks: [],
    topGenres: [],
    recentArtists: [],
    metrics: [],
    hostSeed: '',
    summary: '',
  };
}

async function requireTasteToken(): Promise<string> {
  const token = await getValidSpotifyAccessToken();
  if (!token) throw new Error('Spotify sign-in required');
  return token;
}

async function fetchSpotify<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401) clearSpotifyToken();
  if (!res.ok) throw new Error(`Spotify taste read failed (${res.status})`);
  return (await res.json()) as T;
}

async function fetchSavedTracks(token: string): Promise<SpotifySavedTracksResponse> {
  let url: string | null = `${API_BASE}/me/tracks?limit=50&market=from_token`;
  const items: SpotifySavedTracksResponse['items'] = [];
  let total = 0;

  while (url && items.length < MAX_SAVED_TRACKS) {
    const page: SpotifySavedTracksResponse = await fetchSpotify(token, url);
    total = page.total ?? total;
    items.push(...page.items);
    url = page.next ?? null;
  }

  return { total, items };
}

function mergeArtists(...groups: SpotifyArtist[][]): SpotifyTasteArtist[] {
  const byId = new Map<string, SpotifyTasteArtist & { score: number }>();
  groups.forEach((group, groupIndex) => {
    group.forEach((artist, index) => {
      const id = artist.id || artist.name.toLowerCase();
      const current = byId.get(id);
      const score = (groups.length - groupIndex) * 100 - index;
      if (!current || score > current.score) {
        byId.set(id, { ...toTasteArtist(artist), score });
      }
    });
  });
  return [...byId.values()].sort((a, b) => b.score - a.score).map(({ score: _score, ...artist }) => artist);
}

function artistsFromTracks(tracks: SpotifyTrack[]): SpotifyTasteArtist[] {
  const byName = new Map<string, SpotifyTasteArtist & { count: number }>();
  for (const track of tracks) {
    for (const artist of track.artists) {
      const name = artist.name.trim();
      if (!name) continue;
      const key = (artist.id || name).toLowerCase();
      const current = byName.get(key);
      if (current) {
        current.count += 1;
        continue;
      }
      byName.set(key, {
        id: artist.id || key,
        name,
        genres: [],
        popularity: null,
        imageUrl: pickImage(track.album.images),
        count: 1,
      });
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(({ count: _count, ...artist }) => artist);
}

function toTasteArtist(artist: SpotifyArtist): SpotifyTasteArtist {
  return {
    id: artist.id || artist.name,
    name: artist.name,
    genres: artist.genres ?? [],
    popularity: Number.isFinite(artist.popularity) ? artist.popularity! : null,
    imageUrl: pickImage(artist.images),
  };
}

function toTasteTrack(track: SpotifyTrack | null): SpotifyTasteTrack | null {
  if (!track) return null;
  return {
    id: track.id,
    name: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album.name,
    popularity: Number.isFinite(track.popularity) ? track.popularity! : null,
    imageUrl: pickImage(track.album.images),
    uri: track.uri,
  };
}

function pickImage(images?: SpotifyImage[]): string {
  return images?.[1]?.url ?? images?.[0]?.url ?? '';
}

function countGenres(artists: SpotifyTasteArtist[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const artist of artists) {
    for (const genre of artist.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return counts;
}

function countTrackArtists(tracks: SpotifyTrack[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    for (const artist of track.artists) {
      counts.set(artist.name, (counts.get(artist.name) ?? 0) + 1);
    }
  }
  return counts;
}

function uniqueTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seen = new Set<string>();
  const unique: SpotifyTrack[] = [];
  for (const track of tracks) {
    const key = track.id || track.uri;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(track);
  }
  return unique;
}

function firstNonEmpty<T>(...groups: T[][]): T[] {
  return groups.find((group) => group.length > 0) ?? [];
}

function rankCounts(counts: Map<string, number>): Array<{ name: string; count: number }> {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildMetrics(input: {
  artists: SpotifyTasteArtist[];
  tracks: SpotifyTasteTrack[];
  savedTracks: SpotifyTrack[];
  topGenres: Array<{ name: string; count: number }>;
  recentArtists: Array<{ name: string; count: number }>;
}): SpotifyTasteMetric[] {
  const popularityValues = [
    ...input.artists.map((a) => a.popularity),
    ...input.tracks.map((t) => t.popularity),
  ].filter((n): n is number => typeof n === 'number');
  const avgPopularity = average(popularityValues);
  const nicheScore = avgPopularity === null ? null : Math.max(0, Math.min(100, Math.round(100 - avgPopularity)));
  const genreFocus = input.topGenres.length
    ? Math.max(0, Math.min(100, Math.round((input.topGenres[0].count / Math.max(1, input.artists.length)) * 100)))
    : 0;
  const recentRepeat = input.recentArtists.length
    ? Math.max(0, Math.min(100, Math.round((input.recentArtists[0].count / 50) * 100)))
    : 0;

  return [
    {
      label: 'Niche score',
      value: nicheScore === null ? 'Learning' : `${nicheScore}%`,
      detail: nicheScore === null ? 'Waiting for Spotify popularity signals' : describeNiche(nicheScore),
    },
    {
      label: 'Genre focus',
      value: `${genreFocus}%`,
      detail: input.topGenres[0] ? `Most concentrated around ${input.topGenres[0].name}` : 'Top artist genres will appear here',
    },
    {
      label: 'Recent repeat',
      value: `${recentRepeat}%`,
      detail: input.recentArtists[0] ? `Recent plays lean toward ${input.recentArtists[0].name}` : 'Recent plays will shape this',
    },
    {
      label: 'Library depth',
      value: `${input.savedTracks.length}`,
      detail: 'Liked tracks sampled for Auracle context',
    },
  ];
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function describeNiche(score: number): string {
  if (score >= 70) return 'Deep-cut leaning';
  if (score >= 45) return 'Balanced between familiar and niche';
  return 'Mainstream-leaning';
}

function buildHostSeed(input: {
  topGenres: Array<{ name: string; count: number }>;
  artists: SpotifyTasteArtist[];
  tracks: SpotifyTasteTrack[];
  recentArtists: Array<{ name: string; count: number }>;
}): string {
  const genre = input.topGenres[0]?.name;
  const artist = input.artists[0]?.name;
  const recent = input.recentArtists[0]?.name;
  const track = input.tracks[0]?.name;
  return [
    genre ? `${genre}-fluent` : 'genre-curious',
    artist ? `artist-aware around ${artist}` : '',
    recent && recent !== artist ? `recently tuned to ${recent}` : '',
    track ? `with ${track} as a reference point` : '',
  ].filter(Boolean).join(', ');
}

function buildSummary(input: {
  topGenres: Array<{ name: string; count: number }>;
  artists: SpotifyTasteArtist[];
  tracks: SpotifyTasteTrack[];
  recentArtists: Array<{ name: string; count: number }>;
  metrics: SpotifyTasteMetric[];
}): string {
  const genres = input.topGenres.slice(0, 3).map((g) => g.name).join(', ');
  const artists = input.artists.slice(0, 3).map((a) => a.name).join(', ');
  const recent = input.recentArtists.slice(0, 2).map((a) => a.name).join(', ');
  const niche = input.metrics.find((m) => m.label === 'Niche score')?.value;
  return [
    genres ? `Core sound: ${genres}.` : '',
    artists ? `Anchor artists: ${artists}.` : '',
    recent ? `Recent pull: ${recent}.` : '',
    niche ? `Discovery tilt: ${niche}.` : '',
  ].filter(Boolean).join(' ');
}
