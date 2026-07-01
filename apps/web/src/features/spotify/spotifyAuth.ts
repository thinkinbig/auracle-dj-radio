const TOKEN_STORAGE_KEY = 'auracle.spotify.token';
const PKCE_STORAGE_KEY = 'auracle.spotify.pkce';

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'user-top-read',
  'user-read-recently-played',
] as const;

export interface SpotifyConfig {
  clientId: string;
  redirectUri: string;
}

interface StoredPkce {
  verifier: string;
  state: string;
  returnTo: string;
}

export interface SpotifyToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface SpotifyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export function getSpotifyConfig(): SpotifyConfig | null {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim();
  if (!clientId) return null;
  const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim()
    || `${window.location.origin}/spotify/callback`;
  return { clientId, redirectUri };
}

export function readSpotifyToken(): SpotifyToken | null {
  try {
    const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpotifyToken;
    if (!parsed.accessToken || !Number.isFinite(parsed.expiresAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasSpotifyToken(): boolean {
  return readSpotifyToken() !== null;
}

export function clearSpotifyToken(): void {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function beginSpotifyLogin(): Promise<void> {
  const config = getSpotifyConfig();
  if (!config) throw new Error('Missing Spotify client id');

  const verifier = randomBase64Url(64);
  const state = randomBase64Url(24);
  const challenge = await sha256Base64Url(verifier);
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const pkce: StoredPkce = { verifier, state, returnTo };
  window.sessionStorage.setItem(PKCE_STORAGE_KEY, JSON.stringify(pkce));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: SPOTIFY_SCOPES.join(' '),
    redirect_uri: config.redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

export async function completeSpotifyRedirectIfPresent(): Promise<boolean> {
  if (window.location.pathname !== '/spotify/callback') return false;

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const rawPkce = window.sessionStorage.getItem(PKCE_STORAGE_KEY);
  window.sessionStorage.removeItem(PKCE_STORAGE_KEY);
  if (!code || !state || !rawPkce) {
    restoreUrl('/');
    return true;
  }

  const pkce = JSON.parse(rawPkce) as StoredPkce;
  if (pkce.state !== state) {
    restoreUrl(pkce.returnTo || '/');
    return true;
  }

  const config = getSpotifyConfig();
  if (!config) {
    restoreUrl(pkce.returnTo || '/');
    return true;
  }

  const token = await requestSpotifyToken({
    clientId: config.clientId,
    body: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      code_verifier: pkce.verifier,
    },
  });
  storeSpotifyToken(token);
  restoreUrl(pkce.returnTo || '/');
  return true;
}

export async function getValidSpotifyAccessToken(): Promise<string | null> {
  const token = readSpotifyToken();
  if (!token) return null;
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) {
    clearSpotifyToken();
    return null;
  }

  const config = getSpotifyConfig();
  if (!config) return null;
  const refreshed = await requestSpotifyToken({
    clientId: config.clientId,
    body: {
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    },
    previousRefreshToken: token.refreshToken,
  });
  storeSpotifyToken(refreshed);
  return refreshed.accessToken;
}

async function requestSpotifyToken({
  clientId,
  body,
  previousRefreshToken,
}: {
  clientId: string;
  body: Record<string, string>;
  previousRefreshToken?: string;
}): Promise<SpotifyToken> {
  const params = new URLSearchParams({ client_id: clientId, ...body });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  if (!res.ok) throw new Error('Spotify token exchange failed');
  const data = (await res.json()) as SpotifyTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previousRefreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

function storeSpotifyToken(token: SpotifyToken): void {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
}

function restoreUrl(path: string): void {
  window.history.replaceState({}, '', path);
}

export function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256Base64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await window.crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
