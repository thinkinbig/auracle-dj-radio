import { getStoredToken, signInWithSpotify, supabase } from '@/features/marketing/authApi';

export type SpotifyAuthConfig = 'supabase';

export function getSpotifyAuthConfig(): SpotifyAuthConfig | null {
  return supabase ? 'supabase' : null;
}

export function hasSpotifySession(): boolean {
  if (typeof window === 'undefined' || !getStoredToken()) return false;
  return findCachedProviderToken() !== null;
}

export async function beginSpotifyLogin(): Promise<void> {
  await signInWithSpotify();
}

export async function getValidSpotifyAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  if (isSpotifyProvider(data.session.user.app_metadata?.provider)) {
    return data.session.provider_token ?? findCachedProviderToken();
  }
  return null;
}

export async function clearSpotifyConnection(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

function findCachedProviderToken(): string | null {
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith('sb-')) continue;
    const value = window.localStorage.getItem(key);
    if (!value) continue;
    const token = readProviderToken(value);
    if (token) return token;
  }
  return null;
}

function readProviderToken(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      provider_token?: unknown;
      user?: { app_metadata?: { provider?: unknown } };
      currentSession?: {
        provider_token?: unknown;
        user?: { app_metadata?: { provider?: unknown } };
      };
    };
    const provider = parsed.user?.app_metadata?.provider ?? parsed.currentSession?.user?.app_metadata?.provider;
    if (!isSpotifyProvider(provider)) return null;
    const token = parsed.provider_token ?? parsed.currentSession?.provider_token;
    return typeof token === 'string' && token.trim() ? token : null;
  } catch {
    return null;
  }
}

function isSpotifyProvider(provider: unknown): boolean {
  return provider === 'spotify';
}
