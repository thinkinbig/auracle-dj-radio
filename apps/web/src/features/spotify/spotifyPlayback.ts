import { useSyncExternalStore } from 'react';
import type { SessionIntent } from '@auracle/shared';
import type { TrackDisplay } from '@/data/trackCatalog';
import {
  beginSpotifyLogin,
  clearSpotifyToken,
  completeSpotifyRedirectIfPresent,
  getSpotifyConfig,
  getValidSpotifyAccessToken,
  hasSpotifyToken,
} from './spotifyAuth';

const ENABLED_STORAGE_KEY = 'auracle.spotify.playback.enabled';
const TRACK_MAP_STORAGE_KEY = 'auracle.spotify.trackMap';
const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';

type SpotifyAuthStatus = 'missing_config' | 'signed_out' | 'signed_in' | 'error';
type SpotifyPlayerStatus = 'idle' | 'connecting' | 'ready' | 'not_ready' | 'error';
type SpotifyQueueStatus = 'idle' | 'loading' | 'ready' | 'error';

export type SpotifyQueueSource = 'saved' | 'top';

export interface SpotifyTrackMatch {
  uri: string;
  title: string;
  artist: string;
  query: string | null;
  fallback: boolean;
}

export interface SpotifyQueueTrack {
  id: string;
  uri: string;
  title: string;
  artist: string;
  albumTitle: string;
  albumCoverUrl: string;
  durationSec: number;
  source: SpotifyQueueSource;
  reason: string;
  score: number;
}

export interface SpotifyPlaybackState {
  enabled: boolean;
  authStatus: SpotifyAuthStatus;
  playerStatus: SpotifyPlayerStatus;
  deviceId: string | null;
  currentUri: string | null;
  lastQuery: string | null;
  lastMatch: string | null;
  trackMatches: Record<string, SpotifyTrackMatch>;
  queueStatus: SpotifyQueueStatus;
  queueTracks: SpotifyQueueTrack[];
  queueError: string | null;
  error: string | null;
}

export interface SpotifyPlaybackSnapshot {
  uri: string | null;
  progressMs: number;
  durationMs: number;
  paused: boolean;
}

interface SpotifySearchTrack {
  uri: string;
  name: string;
  artists: { name: string }[];
}

interface SpotifySearchResponse {
  tracks?: {
    items: SpotifySearchTrack[];
  };
}

interface SpotifyApiImage {
  url: string;
  width?: number;
  height?: number;
}

interface SpotifyApiTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  popularity?: number;
  artists: { id?: string; name: string }[];
  album: {
    name: string;
    images?: SpotifyApiImage[];
  };
}

interface SpotifyTopTracksResponse {
  items: SpotifyApiTrack[];
}

interface SpotifySavedTracksResponse {
  items: Array<{ track: SpotifyApiTrack | null }>;
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  track_window: {
    current_track?: {
      uri: string;
      name: string;
      duration_ms: number;
      artists: { name: string }[];
    };
  };
}

interface SpotifyWebPlaybackPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
  addListener(event: 'ready', cb: (payload: { device_id: string }) => void): boolean;
  addListener(event: 'not_ready', cb: (payload: { device_id: string }) => void): boolean;
  addListener(event: 'player_state_changed', cb: (state: SpotifyPlayerState | null) => void): boolean;
  addListener(event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error', cb: (error: { message: string }) => void): boolean;
}

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyWebPlaybackPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let state: SpotifyPlaybackState = {
  enabled: readEnabled(),
  authStatus: getSpotifyConfig() ? (hasSpotifyToken() ? 'signed_in' : 'signed_out') : 'missing_config',
  playerStatus: 'idle',
  deviceId: null,
  currentUri: null,
  lastQuery: null,
  lastMatch: null,
  trackMatches: {},
  queueStatus: 'idle',
  queueTracks: [],
  queueError: null,
  error: null,
};

let player: SpotifyWebPlaybackPlayer | null = null;
let playerPromise: Promise<SpotifyWebPlaybackPlayer> | null = null;
let sdkPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function getSpotifyPlaybackState(): SpotifyPlaybackState {
  return state;
}

export function subscribeSpotifyPlayback(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSpotifyPlaybackState(): SpotifyPlaybackState {
  return useSyncExternalStore(subscribeSpotifyPlayback, getSpotifyPlaybackState, getSpotifyPlaybackState);
}

export function isSpotifyPlaybackEnabled(): boolean {
  return state.enabled;
}

export async function handleSpotifyRedirect(): Promise<void> {
  try {
    const completed = await completeSpotifyRedirectIfPresent();
    if (completed) {
      setEnabled(true);
      patchState({ authStatus: 'signed_in', error: null });
    }
  } catch (err) {
    patchState({ authStatus: 'error', error: describeError(err, 'Spotify sign-in failed') });
  }
}

export function setSpotifyPlaybackEnabled(enabled: boolean): void {
  setEnabled(enabled);
}

export async function connectSpotifyPlayback(): Promise<void> {
  if (!getSpotifyConfig()) {
    patchState({ authStatus: 'missing_config', error: 'Missing VITE_SPOTIFY_CLIENT_ID' });
    return;
  }
  if (!hasSpotifyToken()) {
    await beginSpotifyLogin();
    return;
  }
  try {
    await ensurePlayer();
    setEnabled(true);
  } catch (err) {
    patchState({ playerStatus: 'error', error: describeError(err, 'Spotify player failed') });
  }
}

export function disconnectSpotifyPlayback(): void {
  void pauseSpotifyPlayback();
  setEnabled(false);
  patchState({ currentUri: null, lastQuery: null, lastMatch: null, error: null });
}

export function signOutSpotify(): void {
  clearSpotifyToken();
  player?.disconnect();
  player = null;
  playerPromise = null;
  setEnabled(false);
  patchState({
    authStatus: getSpotifyConfig() ? 'signed_out' : 'missing_config',
    playerStatus: 'idle',
    deviceId: null,
    currentUri: null,
    lastQuery: null,
    lastMatch: null,
    trackMatches: {},
    queueStatus: 'idle',
    queueTracks: [],
    queueError: null,
    error: null,
  });
}

export async function buildSpotifyQueueFromTaste(intent: SessionIntent, targetCount = 8): Promise<SpotifyQueueTrack[]> {
  if (!state.enabled) return [];
  patchState({ queueStatus: 'loading', queueError: null });
  try {
    const token = await requireAccessToken();
    const [top, saved] = await Promise.all([
      fetchSpotify<SpotifyTopTracksResponse>(
        token,
        'https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term',
      ).catch(() => ({ items: [] })),
      fetchSpotify<SpotifySavedTracksResponse>(
        token,
        'https://api.spotify.com/v1/me/tracks?limit=50',
      ),
    ]);
    const queue = rankSpotifyTracks(intent, [
      ...saved.items.flatMap((item) => item.track ? [toQueueCandidate(item.track, 'saved')] : []),
      ...top.items.map((track) => toQueueCandidate(track, 'top')),
    ]).slice(0, targetCount);
    patchState({
      queueStatus: 'ready',
      queueTracks: queue,
      queueError: queue.length > 0 ? null : 'No Spotify library tracks available',
    });
    return queue;
  } catch (err) {
    const message = describeError(err, 'Could not read Spotify library');
    patchState({ queueStatus: 'error', queueTracks: [], queueError: message, error: message });
    return [];
  }
}

export async function playTrackOnSpotify(track: TrackDisplay): Promise<boolean> {
  if (!state.enabled) return false;
  try {
    const activePlayer = await ensurePlayer();
    const token = await requireAccessToken();
    const uri = await resolveSpotifyUri(track, token);
    if (!uri || !state.deviceId) {
      patchState({
        currentUri: null,
        lastMatch: null,
        error: `No Spotify match for ${track.title}`,
      });
      return false;
    }

    await fetchSpotify(token, `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(state.deviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [uri] }),
    });
    await activePlayer.setVolume(1);
    patchState({ currentUri: uri, error: null });
    return true;
  } catch (err) {
    patchState({ playerStatus: 'error', error: describeError(err, 'Spotify playback failed') });
    return false;
  }
}

export async function playSpotifyQueueTrack(track: SpotifyQueueTrack): Promise<boolean> {
  if (!state.enabled) return false;
  try {
    const activePlayer = await ensurePlayer();
    const token = await requireAccessToken();
    if (!state.deviceId) {
      patchState({ currentUri: null, error: 'Spotify player is not ready yet' });
      return false;
    }

    await fetchSpotify(token, `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(state.deviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [track.uri] }),
    });
    await activePlayer.setVolume(1);
    patchState({
      currentUri: track.uri,
      lastMatch: `${track.title} · ${track.artist}`,
      error: null,
    });
    return true;
  } catch (err) {
    patchState({ playerStatus: 'error', error: describeError(err, 'Spotify playback failed') });
    return false;
  }
}

export async function pauseSpotifyPlayback(): Promise<void> {
  if (!state.enabled || !player) return;
  await player.pause().catch(() => {});
}

export async function resumeSpotifyPlayback(): Promise<void> {
  if (!state.enabled || !player) return;
  await player.resume().catch(() => {});
}

export async function setSpotifyVolume(volume: number): Promise<void> {
  if (!state.enabled || !player) return;
  await player.setVolume(Math.max(0, Math.min(1, volume))).catch(() => {});
}

export async function getSpotifyPlaybackSnapshot(): Promise<SpotifyPlaybackSnapshot | null> {
  if (!state.enabled || !player) return null;
  const current = await player.getCurrentState().catch(() => null);
  if (!current) return null;
  const track = current.track_window.current_track;
  return {
    uri: track?.uri ?? null,
    progressMs: current.position,
    durationMs: track?.duration_ms ?? 0,
    paused: current.paused,
  };
}

export function buildSpotifySearchQuery(track: Pick<TrackDisplay, 'title' | 'artist'>): string {
  return `track:${quoteSearchTerm(track.title)} artist:${quoteSearchTerm(track.artist)}`;
}

export function buildSpotifyFallbackQueries(track: Pick<TrackDisplay, 'title' | 'artist' | 'mood'>): string[] {
  return [
    buildSpotifySearchQuery(track),
    track.title,
    `${track.mood} instrumental`,
    `${track.mood} focus`,
    'lofi focus instrumental',
  ].map((q) => q.trim()).filter(Boolean);
}

function toQueueCandidate(track: SpotifyApiTrack, source: SpotifyQueueSource): SpotifyQueueTrack {
  return {
    id: track.id,
    uri: track.uri,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    albumTitle: track.album.name,
    albumCoverUrl: pickImage(track.album.images),
    durationSec: Math.max(1, Math.round(track.duration_ms / 1000)),
    source,
    reason: source === 'saved' ? 'Saved in your Spotify library' : 'One of your Spotify top tracks',
    score: track.popularity ?? 0,
  };
}

function rankSpotifyTracks(intent: SessionIntent, tracks: SpotifyQueueTrack[]): SpotifyQueueTrack[] {
  const seen = new Set<string>();
  const terms = tokenize(`${intent.mood} ${intent.scene}`);
  return tracks
    .filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    })
    .map((track, index) => ({
      ...track,
      score: spotifyIntentScore(track, terms) + track.score / 100 + (track.source === 'saved' ? 1.2 : 0) - index * 0.01,
    }))
    .sort((a, b) => b.score - a.score);
}

function spotifyIntentScore(track: SpotifyQueueTrack, terms: string[]): number {
  const haystack = tokenize(`${track.title} ${track.artist} ${track.albumTitle}`).join(' ');
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += 3;
  }
  if (terms.includes('calm') || terms.includes('chill') || terms.includes('focused') || terms.includes('study')) {
    if (haystack.match(/\b(acoustic|ambient|calm|chill|focus|lofi|piano|soft|sleep|study)\b/)) score += 2;
  }
  if (terms.includes('energetic') || terms.includes('gym') || terms.includes('party')) {
    if (haystack.match(/\b(dance|energy|hype|party|run|workout|club|remix)\b/)) score += 2;
  }
  return score;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2);
}

function pickImage(images?: SpotifyApiImage[]): string {
  return images?.[1]?.url ?? images?.[0]?.url ?? '';
}

export function selectBestSpotifyMatch(
  track: Pick<TrackDisplay, 'title' | 'artist'>,
  items: SpotifySearchTrack[],
): SpotifySearchTrack | null {
  if (items.length === 0) return null;
  const title = normalizeForMatch(track.title);
  const artist = normalizeForMatch(track.artist);
  return (
    items.find((item) => normalizeForMatch(item.name) === title && item.artists.some((a) => normalizeForMatch(a.name) === artist))
    ?? items.find((item) => normalizeForMatch(item.name).includes(title) || title.includes(normalizeForMatch(item.name)))
    ?? items[0]
    ?? null
  );
}

async function ensurePlayer(): Promise<SpotifyWebPlaybackPlayer> {
  if (player) return player;
  if (playerPromise) return playerPromise;
  playerPromise = createPlayer();
  return playerPromise;
}

async function createPlayer(): Promise<SpotifyWebPlaybackPlayer> {
  patchState({ playerStatus: 'connecting', error: null });
  await loadSpotifySdk();
  const accessToken = await requireAccessToken();
  const nextPlayer = new window.Spotify!.Player({
    name: 'Auracle Spotify Radio',
    volume: 1,
    getOAuthToken: (cb) => {
      void getValidSpotifyAccessToken().then((token) => cb(token ?? accessToken));
    },
  });

  nextPlayer.addListener('ready', ({ device_id }) => {
    patchState({ playerStatus: 'ready', deviceId: device_id, authStatus: 'signed_in', error: null });
  });
  nextPlayer.addListener('not_ready', ({ device_id }) => {
    if (state.deviceId !== device_id) return;
    patchState({ playerStatus: 'not_ready', deviceId: null });
  });
  nextPlayer.addListener('player_state_changed', (nextState) => {
    const current = nextState?.track_window.current_track;
    if (!current) return;
    patchState({
      currentUri: current.uri,
      lastMatch: `${current.name} · ${current.artists.map((a) => a.name).join(', ')}`,
    });
  });
  for (const event of ['initialization_error', 'authentication_error', 'account_error', 'playback_error'] as const) {
    nextPlayer.addListener(event, (error) => {
      patchState({ playerStatus: 'error', error: error.message });
    });
  }

  const connected = await nextPlayer.connect();
  if (!connected) throw new Error('Spotify player could not connect');
  player = nextPlayer;
  return nextPlayer;
}

async function loadSpotifySdk(): Promise<void> {
  if (window.Spotify) return;
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    const timeout = window.setTimeout(() => reject(new Error('Spotify SDK load timed out')), 15_000);
    window.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    if (existing) return;
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Spotify SDK failed to load'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

async function resolveSpotifyUri(track: TrackDisplay, token: string): Promise<string | null> {
  const mapped = readTrackMap()[track.id];
  if (mapped) {
    rememberTrackMatch(track.id, {
      uri: mapped,
      title: track.title,
      artist: track.artist,
      query: null,
      fallback: false,
    });
    return mapped;
  }

  const queries = buildSpotifyFallbackQueries(track);
  for (const [index, query] of queries.entries()) {
    patchState({ lastQuery: query });
    const params = new URLSearchParams({ q: query, type: 'track', limit: '5' });
    const data = await fetchSpotify<SpotifySearchResponse>(
      token,
      `https://api.spotify.com/v1/search?${params}`,
    );
    const match = selectBestSpotifyMatch(track, data.tracks?.items ?? []);
    if (match) {
      rememberTrackMatch(track.id, {
        uri: match.uri,
        title: match.name,
        artist: match.artists.map((a) => a.name).join(', '),
        query,
        fallback: index > 0,
      });
      return match.uri;
    }
  }
  return null;
}

function rememberTrackMatch(trackId: string, match: SpotifyTrackMatch): void {
  patchState({
    lastQuery: match.query,
    lastMatch: `${match.title} · ${match.artist}`,
    trackMatches: { ...state.trackMatches, [trackId]: match },
  });
}

async function requireAccessToken(): Promise<string> {
  const token = await getValidSpotifyAccessToken();
  if (!token) {
    patchState({ authStatus: 'signed_out', error: 'Spotify sign-in required' });
    throw new Error('Spotify sign-in required');
  }
  return token;
}

async function fetchSpotify<T = void>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    clearSpotifyToken();
    patchState({ authStatus: 'signed_out', error: 'Spotify sign-in expired' });
  }
  if (!res.ok) {
    if (res.status === 403) throw new Error('Reconnect Spotify to allow library/top-track access, or use Premium for playback');
    throw new Error(`Spotify API failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function readTrackMap(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(TRACK_MAP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setEnabled(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? '1' : '0');
  }
  patchState({ enabled });
}

function readEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ENABLED_STORAGE_KEY) === '1';
}

function patchState(patch: Partial<SpotifyPlaybackState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function quoteSearchTerm(value: string): string {
  const trimmed = value.replace(/"/g, '').trim();
  return trimmed.includes(' ') ? `"${trimmed}"` : trimmed;
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function describeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
