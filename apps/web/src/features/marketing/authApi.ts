import { createClient, type Session, type User } from '@supabase/supabase-js';
import type { AuthResponse, AuthUser, RegisterCredentials } from '@auracle/shared';
import { EMAIL_ALREADY_REGISTERED_MESSAGE, getAuthErrorMessage } from './authErrors';
import { checkAuthRateLimit, resetAuthRateLimit } from './authRateLimit';

const TOKEN_KEY = 'auracle.authToken';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const SPOTIFY_OAUTH_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'user-top-read',
  'user-read-recently-played',
] as const;

export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function requireSupabase() {
  if (!supabase) throw new Error('Missing Supabase configuration');
  return supabase;
}

function userFromSupabase(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};
  const provider = stringValue(user.app_metadata?.provider);
  const name =
    stringValue(metadata.name) ||
    stringValue(metadata.full_name) ||
    stringValue(metadata.user_name) ||
    stringValue(metadata.preferred_username) ||
    user.email?.split('@')[0] ||
    'Listener';
  return {
    id: user.id,
    email: user.email ?? `${user.id}@supabase.local`,
    name,
    ...(provider ? { provider } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function hasAuthRedirectParams(): boolean {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return search.has('code') || search.has('error') || hash.has('access_token') || hash.has('error');
}

function clearAuthRedirectParams(): void {
  if (!hasAuthRedirectParams()) return;
  window.history.replaceState({}, '', window.location.pathname);
}

async function exchangeRedirectCodeIfPresent(): Promise<Session | undefined> {
  const client = requireSupabase();
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) {
    clearAuthRedirectParams();
    return undefined;
  }
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  clearAuthRedirectParams();
  if (error) throw new Error(error.message);
  return data.session ?? undefined;
}

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
}

/** JSON request headers with Bearer auth when a token is stored. */
export function jsonAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Bearer auth headers WITHOUT a Content-Type — for bodyless POSTs. Declaring a
 * JSON content-type on an empty body makes Fastify reject it with
 * FST_ERR_CTP_EMPTY_JSON_BODY (400), so bodyless calls must omit it.
 */
export function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeToken(token: string, remember: boolean): void {
  clearStoredToken();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(TOKEN_KEY, token);
}

export function syncStoredToken(session: Session | null, remember = true): void {
  if (session?.access_token) storeToken(session.access_token, remember);
  else clearStoredToken();
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
}

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? 'Request failed', res.status);
  }
  return (await res.json()) as T;
}

async function syncAuracleUser(session: Session, remember = true): Promise<AuthResponse> {
  syncStoredToken(session, remember);
  const response = await authFetch<{ user: AuthUser }>('/auth/me');
  return { user: response.user, token: session.access_token };
}

export async function register(credentials: RegisterCredentials, remember: boolean): Promise<AuthResponse> {
  checkAuthRateLimit();
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: { data: { name: credentials.name } },
  });
  if (error) throw new Error(getAuthErrorMessage(error));
  // signUp() for an already-registered, confirmed email returns 200 with no
  // error and session: null (Supabase obfuscates this to avoid leaking
  // which emails are registered). identities: [] is the documented way to
  // tell it apart from a genuine new signup awaiting email confirmation.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
  }
  if (!data.session) {
    throw new Error('Check your email to confirm your account, then log in.');
  }
  resetAuthRateLimit();
  return syncAuracleUser(data.session, remember);
}

export async function login(credentials: RegisterCredentials, remember: boolean): Promise<AuthResponse> {
  checkAuthRateLimit();
  const client = requireSupabase();
  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error) throw new Error(getAuthErrorMessage(error));
  if (!data.session) throw new Error('Supabase did not return a session');
  resetAuthRateLimit();
  return syncAuracleUser(data.session, remember);
}

export async function signInWithSpotify(): Promise<void> {
  checkAuthRateLimit();
  const client = requireSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      redirectTo: window.location.origin,
      scopes: SPOTIFY_OAUTH_SCOPES.join(' '),
    },
  });
  if (error) throw new Error(getAuthErrorMessage(error));
}

export async function signInWithGoogle(): Promise<void> {
  checkAuthRateLimit();
  const client = requireSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw new Error(getAuthErrorMessage(error));
}

export async function logout(): Promise<void> {
  try {
    if (supabase) await supabase.auth.signOut();
    await authFetch<{ ok: true }>('/auth/logout', { method: 'POST' });
  } catch {
    /* local sign-out still succeeds */
  } finally {
    clearStoredToken();
  }
}

export async function restoreUser(): Promise<AuthUser | undefined> {
  const client = requireSupabase();
  const redirectSession = await exchangeRedirectCodeIfPresent();
  const { data, error } = redirectSession ? { data: { session: redirectSession }, error: null } : await client.auth.getSession();
  if (error || !data.session) {
    clearStoredToken();
    return undefined;
  }

  try {
    return (await syncAuracleUser(data.session)).user;
  } catch (err) {
    // Only a genuine auth rejection means the token is invalid. A transient
    // outage (network error / 5xx) must NOT wipe a still-valid login.
    if (err instanceof ApiError && err.status === 401) {
      await client.auth.signOut();
      clearStoredToken();
    }
    return userFromSupabase(data.session.user);
  }
}
