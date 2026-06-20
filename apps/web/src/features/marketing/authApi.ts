import type { AuthResponse, AuthUser, RegisterCredentials } from '@auracle/shared';

const TOKEN_KEY = 'auracle.authToken';

export function getStoredToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function authFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Request failed');
  }
  return (await res.json()) as T;
}

export async function register(credentials: RegisterCredentials): Promise<AuthResponse> {
  const response = await authFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  storeToken(response.token);
  return response;
}

export async function login(credentials: RegisterCredentials): Promise<AuthResponse> {
  const response = await authFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  });
  storeToken(response.token);
  return response;
}

export async function restoreUser(): Promise<AuthUser | undefined> {
  if (!getStoredToken()) return undefined;
  try {
    const response = await authFetch<{ user: AuthUser }>('/auth/me');
    return response.user;
  } catch {
    clearStoredToken();
    return undefined;
  }
}
