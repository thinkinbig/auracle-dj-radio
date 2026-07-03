import { clearSpotifyToken, getSpotifyConfig, getValidSpotifyAccessToken, hasSpotifyToken } from './spotifyAuth';

const API_BASE = 'https://api.spotify.com/v1';
const MAX_SAVED_TRACKS = 100;

const KNOWN_ARTIST_GENRES: Record<string, string[]> = {
  'billie eilish': ['alt pop'],
  'charli xcx': ['hyperpop', 'electropop'],
  'cocteau twins': ['dream pop', 'shoegaze'],
  'dua lipa': ['dance pop'],
  grimes: ['art pop', 'electropop'],
  'lana del rey': ['alt pop', 'dream pop'],
  lorde: ['art pop', 'alt pop'],
  'tame impala': ['psych pop'],
  'taylor swift': ['pop'],
  'the weeknd': ['r&b', 'pop'],
};

const GENRE_KEYWORDS: Array<{ genre: string; terms: string[] }> = [
  { genre: 'hip hop', terms: ['hip hop', 'rap', 'trap', 'drill'] },
  { genre: 'r&b', terms: ['r&b', 'rnb', 'soul', 'neo soul'] },
  { genre: 'indie rock', terms: ['indie rock', 'garage rock', 'post punk'] },
  { genre: 'indie pop', terms: ['indie pop', 'bedroom pop'] },
  { genre: 'dream pop', terms: ['dream pop', 'shoegaze', 'ethereal', 'heaven or las vegas'] },
  { genre: 'art pop', terms: ['art pop', 'avant pop', 'grimes'] },
  { genre: 'electropop', terms: ['electropop', 'synth pop', 'synthpop', 'electronic'] },
  { genre: 'dance pop', terms: ['dance pop', 'club', 'dance'] },
  { genre: 'house', terms: ['house', 'deep house', 'tech house'] },
  { genre: 'ambient', terms: ['ambient', 'drone', 'new age'] },
  { genre: 'folk', terms: ['folk', 'acoustic', 'singer songwriter'] },
  { genre: 'pop', terms: ['pop'] },
];

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

export interface SpotifyTasteRoast {
  verdict: string;
  score: number;
  scoreLabel: string;
  summary: string;
  evidence: SpotifyTasteMetric[];
  burns: string[];
  tags: string[];
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

interface SpotifyArtistsResponse {
  artists: SpotifyArtist[];
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

  const trackArtistDetails = await fetchArtistsForTracks(token, [
    ...tracksMedium.items,
    ...savedTracks,
    ...recentTracks,
  ]).catch(() => new Map<string, SpotifyArtist>());
  const spotifyTopArtists = hydrateArtistsWithDetails(
    mergeArtists(artistsShort.items, artistsMedium.items, artistsLong.items),
    trackArtistDetails,
  );
  const fallbackArtists = artistsFromTracks([...recentTracks, ...savedTracks], trackArtistDetails);
  const tracks = firstNonEmpty(
    tracksMedium.items,
    uniqueTracks(savedTracks),
    uniqueTracks(recentTracks),
  ).map(toTasteTrack).filter((track): track is SpotifyTasteTrack => Boolean(track));
  const artists = hasArtistSignals(spotifyTopArtists)
    ? spotifyTopArtists
    : fallbackArtists.length > 0
      ? fallbackArtists
      : spotifyTopArtists;
  const recentArtists = rankCounts(countTrackArtists(firstNonEmpty(recentTracks, savedTracks))).slice(0, 6);
  const topGenres = firstNonEmpty(
    rankCounts(countGenres(artists)),
    inferGenreCounts({ artists, tracks, recentArtists }),
  );
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

export function buildSpotifyTasteRoast(profile: SpotifyTasteProfile): SpotifyTasteRoast {
  const topGenre = profile.topGenres[0]?.name;
  const genreSignal = topGenre ?? 'mixed taste signals';
  const topArtist = profile.topArtists[0]?.name ?? 'one mysterious artist';
  const topTrack = profile.topTracks[0];
  const recentArtist = profile.recentArtists[0]?.name;
  const niche = metricPercent(profile, 'Niche score');
  const genreFocus = metricPercent(profile, 'Genre focus') ?? 0;
  const recentRepeat = metricPercent(profile, 'Recent repeat') ?? 0;
  const libraryDepth = profile.savedTrackCount;
  const roastScore = clamp(
    34
      + genreFocus * 0.24
      + recentRepeat * 0.62
      + (niche === null ? 8 : Math.abs(niche - 50) * 0.34)
      + (libraryDepth < 24 ? 12 : libraryDepth > 90 ? 7 : 0),
    22,
    96,
  );
  const verdict = pickVerdict({ roastScore, niche, genreFocus, recentRepeat, topGenre });
  const evidence = profile.metrics.filter(isRoastEvidenceMetric);
  const burns = unique([
    genreFocus >= 52 && topGenre
      ? `You said "range" and then moved into ${topGenre} with a year-long lease.`
      : `Your taste signals are scattered enough to look intentional, which is suspiciously convenient.`,
    niche !== null && niche >= 68
      ? `Your deep cuts have deep cuts, and half of them sound like they were found under a record shop receipt.`
      : niche !== null && niche <= 34
        ? `Your algorithm is not predicting you anymore; it is clocking in for an easy shift.`
        : `You sit right between obscure and obvious, the diplomatic immunity of music taste.`,
    recentRepeat >= 18 && recentArtist
      ? `${recentArtist} has heard from you more than some of your group chats.`
      : `Your recent plays are behaved enough to look curated, which is exactly what a repeat listener would claim.`,
    topTrack
      ? `"${topTrack.name}" by ${topTrack.artist} is doing a lot of emotional admin work here.`
      : `${topArtist} is carrying this profile like it is a two-item group project.`,
    libraryDepth < 24
      ? `Your liked songs library is giving minimalist installation, mostly because there is barely anything installed.`
      : libraryDepth > 90
        ? `You save songs like you are preparing evidence for a very stylish trial.`
        : `The library has enough shape to judge, unfortunately for everyone involved.`,
  ]).slice(0, 5);
  const tags = unique([
    genreSignal,
    recentRepeat >= 18 ? 'repeat offender' : 'controlled chaos',
    niche !== null && niche >= 68 ? 'deep-cut defense' : niche !== null && niche <= 34 ? 'algorithm friendly' : 'taste diplomat',
  ]);

  return {
    verdict,
    score: roastScore,
    scoreLabel: `${roastScore}% heat`,
    summary: `Auracle found ${genreSignal}, ${recentRepeat}% recent-repeat energy, and ${topArtist} orbiting near the center.`,
    evidence,
    burns,
    tags,
  };
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

async function fetchArtistsForTracks(token: string, tracks: SpotifyTrack[]): Promise<Map<string, SpotifyArtist>> {
  const ids = uniqueArtistIds(tracks).slice(0, 50);
  if (ids.length === 0) return new Map();
  const response = await fetchSpotify<SpotifyArtistsResponse>(token, `${API_BASE}/artists?ids=${ids.join(',')}`);
  return new Map(response.artists.filter(Boolean).map((artist) => [artist.id, artist]));
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

function hydrateArtistsWithDetails(
  artists: SpotifyTasteArtist[],
  details: Map<string, SpotifyArtist>,
): SpotifyTasteArtist[] {
  return artists.map((artist) => {
    const detail = details.get(artist.id);
    if (!detail) return artist;
    const hydrated = toTasteArtist(detail);
    return {
      ...artist,
      genres: artist.genres.length > 0 ? artist.genres : hydrated.genres,
      popularity: artist.popularity ?? hydrated.popularity,
      imageUrl: artist.imageUrl || hydrated.imageUrl,
    };
  });
}

function hasArtistSignals(artists: SpotifyTasteArtist[]): boolean {
  return artists.some((artist) => artist.genres.length > 0 || artist.popularity !== null);
}

function artistsFromTracks(tracks: SpotifyTrack[], details: Map<string, SpotifyArtist> = new Map()): SpotifyTasteArtist[] {
  const byName = new Map<string, SpotifyTasteArtist & { count: number }>();
  for (const track of tracks) {
    for (const artist of track.artists) {
      const name = artist.name.trim();
      if (!name) continue;
      const key = (artist.id || name).toLowerCase();
      const detail = artist.id ? details.get(artist.id) : undefined;
      const current = byName.get(key);
      if (current) {
        current.count += 1;
        continue;
      }
      const hydrated = detail ? toTasteArtist(detail) : undefined;
      byName.set(key, {
        id: hydrated?.id || artist.id || key,
        name: hydrated?.name || name,
        genres: hydrated?.genres ?? [],
        popularity: hydrated?.popularity ?? null,
        imageUrl: hydrated?.imageUrl || pickImage(track.album.images),
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

function uniqueArtistIds(tracks: SpotifyTrack[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const track of tracks) {
    for (const artist of track.artists) {
      if (!artist.id || seen.has(artist.id)) continue;
      seen.add(artist.id);
      ids.push(artist.id);
    }
  }
  return ids;
}

function firstNonEmpty<T>(...groups: T[][]): T[] {
  return groups.find((group) => group.length > 0) ?? [];
}

function rankCounts(counts: Map<string, number>): Array<{ name: string; count: number }> {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function inferGenreCounts(input: {
  artists: SpotifyTasteArtist[];
  tracks: SpotifyTasteTrack[];
  recentArtists: Array<{ name: string; count: number }>;
}): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  const weightedArtistNames = [
    ...input.artists.map((artist) => ({ name: artist.name, count: 2 })),
    ...input.recentArtists.map((artist) => ({ name: artist.name, count: Math.max(1, Math.round(artist.count / 8)) })),
  ];

  for (const artist of weightedArtistNames) {
    for (const genre of KNOWN_ARTIST_GENRES[artist.name.toLowerCase()] ?? []) {
      counts.set(genre, (counts.get(genre) ?? 0) + artist.count);
    }
  }

  const text = [
    ...input.artists.map((artist) => artist.name),
    ...input.recentArtists.map((artist) => artist.name),
    ...input.tracks.flatMap((track) => [track.name, track.artist, track.album]),
  ].join(' ').toLowerCase();

  for (const item of GENRE_KEYWORDS) {
    if (item.terms.some((term) => text.includes(term))) {
      counts.set(item.genre, (counts.get(item.genre) ?? 0) + 1);
    }
  }

  return rankCounts(counts);
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

function metricPercent(profile: SpotifyTasteProfile, label: string): number | null {
  const value = profile.metrics.find((metric) => metric.label === label)?.value;
  if (!value?.endsWith('%')) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRoastEvidenceMetric(metric: SpotifyTasteMetric): boolean {
  if (!['Niche score', 'Genre focus', 'Recent repeat', 'Library depth'].includes(metric.label)) return false;
  if (metric.label === 'Niche score' && metric.value === 'Learning') return false;
  if (metric.label === 'Genre focus' && metric.value === '0%') return false;
  return true;
}

function pickVerdict(input: {
  roastScore: number;
  niche: number | null;
  genreFocus: number;
  recentRepeat: number;
  topGenre?: string;
}): string {
  if (input.recentRepeat >= 28) return 'Certified Repeat Offender';
  if (input.genreFocus >= 62 && input.topGenre) return `${titleCase(input.topGenre)} Monogamist`;
  if (input.niche !== null && input.niche >= 72) return 'Deep-Cut Defense Attorney';
  if (input.niche !== null && input.niche <= 30) return "The Algorithm's Favorite Child";
  if (input.roastScore >= 72) return 'Tastefully Chaotic';
  return 'Soft Roast, Medium Evidence';
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
