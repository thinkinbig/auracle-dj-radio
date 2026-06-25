import type { AuthResponse, AuthUser, RegisterCredentials } from '@auracle/shared';

const TOKEN_KEY = 'auracle.authToken';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY) ?? window.sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string, remember: boolean): void {
  clearStoredToken();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(TOKEN_KEY, token);
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

export async function register(credentials: RegisterCredentials, remember: boolean): Promise<AuthResponse> {
  const response = await authFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  storeToken(response.token, remember);
  return response;
}

export async function login(credentials: RegisterCredentials, remember: boolean): Promise<AuthResponse> {
  const response = await authFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  });
  storeToken(response.token, remember);
  return response;
}

export async function logout(): Promise<void> {
  try {
    await authFetch<{ ok: true }>('/auth/logout', { method: 'POST' });
  } catch {
    /* local sign-out still succeeds */
  } finally {
    clearStoredToken();
  }
}

export async function restoreUser(): Promise<AuthUser | undefined> {
  if (!getStoredToken()) return undefined;
  try {
    const response = await authFetch<{ user: AuthUser }>('/auth/me');
    return response.user;
  } catch (err) {
    // Only a genuine auth rejection means the token is invalid. A transient
    // outage (network error / 5xx) must NOT wipe a still-valid login.
    if (err instanceof ApiError && err.status === 401) clearStoredToken();
    return undefined;
  }
}
