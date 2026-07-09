import { useSyncExternalStore } from 'react';
import type { TrackSeed } from '@auracle/shared';
import {
  beginSpotifyLogin,
  clearSpotifyConnection,
  getSpotifyAuthConfig,
  getValidSpotifyAccessToken,
  hasSpotifySession,
} from './spotifyAuth';
import { refreshSpotifyTasteQuery } from '@/shared/query/queryClient';

const ENABLED_STORAGE_KEY = 'auracle.spotify.playback.enabled';
const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';

type SpotifyAuthStatus = 'missing_config' | 'signed_out' | 'signed_in' | 'error';
type SpotifyPlayerStatus = 'idle' | 'connecting' | 'ready' | 'not_ready' | 'error';
type SpotifyGatherStatus = 'idle' | 'loading' | 'ready' | 'error';
/** 'unknown' until the first GET /me check runs (or after sign-out); 'checking' while it's in flight. */
export type SpotifyPremiumStatus = 'unknown' | 'checking' | 'yes' | 'no';

/**
 * Connection + gather state. Under ADR-0005 the client only *gathers* candidates
 * and *plays* a known uri — ranking is server-side, so there is no client queue here.
 */
export interface SpotifyPlaybackState {
  enabled: boolean;
  authStatus: SpotifyAuthStatus;
  playerStatus: SpotifyPlayerStatus;
  /** Result of the GET /me `product === "premium"` check (playback requires Premium). */
  premiumStatus: SpotifyPremiumStatus;
  deviceId: string | null;
  currentUri: string | null;
  gatherStatus: SpotifyGatherStatus;
  gatherError: string | null;
  error: string | null;
}

export interface SpotifyPlaybackSnapshot {
  uri: string | null;
  progressMs: number;
  durationMs: number;
  paused: boolean;
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
  /** Present only when the request passes `market`; false ⇒ unplayable in the user's market. */
  is_playable?: boolean;
  artists: { id?: string; name: string }[];
  album: {
    name: string;
    images?: SpotifyApiImage[];
  };
}

interface SpotifySavedTracksResponse {
  items: Array<{ track: SpotifyApiTrack | null }>;
}

interface SpotifyTopTracksResponse {
  items: SpotifyApiTrack[];
}

interface SpotifyRecentlyPlayedResponse {
  items: Array<{ track: SpotifyApiTrack | null }>;
}

interface SpotifyMeResponse {
  product?: string;
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
  authStatus: getSpotifyAuthConfig() ? (hasSpotifySession() ? 'signed_in' : 'signed_out') : 'missing_config',
  playerStatus: 'idle',
  premiumStatus: 'unknown',
  deviceId: null,
  currentUri: null,
  gatherStatus: 'idle',
  gatherError: null,
  error: null,
};

let player: SpotifyWebPlaybackPlayer | null = null;
let playerPromise: Promise<SpotifyWebPlaybackPlayer> | null = null;
let sdkPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();
const deviceReadyWaiters = new Set<(deviceId: string | null) => void>();

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

export function setSpotifyPlaybackEnabled(enabled: boolean): void {
  setEnabled(enabled);
}

export async function connectSpotifyPlayback(): Promise<void> {
  if (!getSpotifyAuthConfig()) {
    patchState({ authStatus: 'missing_config', error: 'Missing Supabase configuration' });
    return;
  }
  if (!(await getValidSpotifyAccessToken())) {
    await beginSpotifyLogin();
    return;
  }
  try {
    const premium = state.premiumStatus === 'yes' ? true : await checkPremium();
    if (!premium) {
      patchState({ error: 'Spotify Premium is required for playback' });
      return;
    }
    await ensurePlayer();
    setEnabled(true);
    refreshSpotifyTasteQuery();
  } catch (err) {
    patchState({ playerStatus: 'error', error: describeError(err, 'Spotify player failed') });
  }
}

export function disconnectSpotifyPlayback(): void {
  void pauseSpotifyPlayback();
  setEnabled(false);
  refreshSpotifyTasteQuery();
  patchState({ currentUri: null, error: null });
}

export function signOutSpotify(): void {
  void clearSpotifyConnection();
  player?.disconnect();
  player = null;
  playerPromise = null;
  setEnabled(false);
  refreshSpotifyTasteQuery();
  patchState({
    authStatus: getSpotifyAuthConfig() ? 'signed_out' : 'missing_config',
    playerStatus: 'idle',
    premiumStatus: 'unknown',
    deviceId: null,
    currentUri: null,
    gatherStatus: 'idle',
    gatherError: null,
    error: null,
  });
}

/** GET /me → cache `product === "premium"`; the hard gate for any programmatic playback (ADR-0005 §8). */
export async function checkPremium(): Promise<boolean> {
  patchState({ premiumStatus: 'checking' });
  try {
    const token = await requireAccessToken();
    const me = await fetchSpotify<SpotifyMeResponse>(token, 'https://api.spotify.com/v1/me');
    const premium = me.product === 'premium';
    patchState({ premiumStatus: premium ? 'yes' : 'no' });
    return premium;
  } catch {
    patchState({ premiumStatus: 'no' });
    return false;
  }
}

/**
 * Gather the listener's library as candidates for the server to rank (ADR-0005).
 * Reading a library only needs the Spotify token; Premium is checked by playback.
 * Market-unplayable tracks are filtered here so the queue never contains a track
 * the DJ would introduce but cannot play. No client-side ranking.
 */
export async function gatherSpotifyCandidates(targetCount = 50): Promise<TrackSeed[]> {
  if (!state.enabled) return [];
  patchState({ gatherStatus: 'loading', gatherError: null });
  try {
    const token = await requireAccessToken();
    const saved = await fetchSpotify<SpotifySavedTracksResponse>(
      token,
      'https://api.spotify.com/v1/me/tracks?limit=50&market=from_token',
    ).catch(() => ({ items: [] }));
    const top = saved.items.length > 0
      ? { items: [] as SpotifyApiTrack[] }
      : await fetchSpotify<SpotifyTopTracksResponse>(
        token,
        'https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term&market=from_token',
      ).catch(() => ({ items: [] }));
    const recent = saved.items.length > 0 || top.items.length > 0
      ? { items: [] as Array<{ track: SpotifyApiTrack | null }> }
      : await fetchSpotify<SpotifyRecentlyPlayedResponse>(
        token,
        'https://api.spotify.com/v1/me/player/recently-played?limit=50',
      ).catch(() => ({ items: [] }));
    const seen = new Set<string>();
    const candidates: TrackSeed[] = [];
    const tracks = [
      ...saved.items.flatMap((i) => (i.track ? [i.track] : [])),
      ...top.items,
      ...recent.items.flatMap((i) => (i.track ? [i.track] : [])),
    ];
    for (const t of tracks) {
      if (t.is_playable === false) continue;
      if (seen.has(t.uri)) continue;
      seen.add(t.uri);
      candidates.push(toTrackRef(t));
      if (candidates.length >= targetCount) break;
    }
    patchState({
      gatherStatus: 'ready',
      gatherError: candidates.length > 0 ? null : 'No playable Spotify library tracks available',
    });
    return candidates;
  } catch (err) {
    const message = describeError(err, 'Could not read Spotify library');
    patchState({ gatherStatus: 'error', gatherError: message, error: message });
    return [];
  }
}

/** Play a known uri on our device (the server already chose it; no search/resolution). */
export async function playSpotifyUri(uri: string): Promise<boolean> {
  if (!state.enabled) return false;
  try {
    await ensurePlayer();
    const token = await requireAccessToken();
    const deviceId = state.deviceId ?? await waitForDeviceId();
    if (!deviceId) {
      patchState({ currentUri: null, error: 'Spotify player is not ready yet' });
      return false;
    }
    await fetchSpotify(token, `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [uri] }),
    });
    patchState({ currentUri: uri, error: null });
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

function toTrackRef(track: SpotifyApiTrack): TrackSeed {
  return {
    uri: track.uri,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    albumTitle: track.album.name,
    albumCoverUrl: pickImage(track.album.images),
    durationSec: Math.max(1, Math.round(track.duration_ms / 1000)),
  };
}

function pickImage(images?: SpotifyApiImage[]): string {
  return images?.[1]?.url ?? images?.[0]?.url ?? '';
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
    notifyDeviceReady(device_id);
  });
  nextPlayer.addListener('not_ready', ({ device_id }) => {
    if (state.deviceId !== device_id) return;
    patchState({ playerStatus: 'not_ready', deviceId: null });
  });
  nextPlayer.addListener('player_state_changed', (nextState) => {
    const current = nextState?.track_window.current_track;
    if (!current) return;
    patchState({ currentUri: current.uri });
  });
  for (const event of ['initialization_error', 'authentication_error', 'account_error', 'playback_error'] as const) {
    nextPlayer.addListener(event, (error) => {
      if (event === 'playback_error' && isEmptyPlayerQueueError(error.message)) {
        patchState({ error: null });
        return;
      }
      patchState({ playerStatus: 'error', error: error.message });
    });
  }

  const connected = await nextPlayer.connect();
  if (!connected) throw new Error('Spotify player could not connect');
  player = nextPlayer;
  return nextPlayer;
}

function waitForDeviceId(timeoutMs = 5000): Promise<string | null> {
  if (state.deviceId) return Promise.resolve(state.deviceId);
  return new Promise((resolve) => {
    let settled = false;
    const done = (deviceId: string | null): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      deviceReadyWaiters.delete(done);
      resolve(deviceId);
    };
    const timeout = window.setTimeout(() => done(null), timeoutMs);
    deviceReadyWaiters.add(done);
  });
}

function notifyDeviceReady(deviceId: string): void {
  for (const waiter of [...deviceReadyWaiters]) waiter(deviceId);
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
    void clearSpotifyConnection();
    patchState({ authStatus: 'signed_out', error: 'Spotify sign-in expired' });
  }
  if (!res.ok) {
    if (res.status === 403) throw new Error('Reconnect Spotify to allow library/top-track access, or use Premium for playback');
    throw new Error(`Spotify API failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
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

function describeError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function isEmptyPlayerQueueError(message: string): boolean {
  return /no list was loaded/i.test(message);
}
