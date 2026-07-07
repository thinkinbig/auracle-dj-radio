/**
 * Client-side guard against rapid-fire auth submissions. This does not
 * replace Supabase's server-side rate limiting (configured in the Supabase
 * dashboard, not visible from this repo) — it exists to keep users from
 * burning through that limit via accidental double-submits (double-click,
 * key-repeat on Enter), and to give a clear countdown instead of a raw
 * "over_request_rate_limit" error surfacing straight from the API.
 *
 * Only the time since the last attempt is tracked (no per-window attempt
 * count). A count-based cap was tried first but it counts every rejected
 * attempt — including expected ones like "email already registered" or a
 * mistyped password — against the same budget, with nothing to clear it
 * short of a successful login. That let it lock out a genuinely-retrying
 * user after a handful of corrections within a minute, which defeats the
 * point. The time-since-last-attempt check self-clears MIN_RETRY_INTERVAL_MS
 * after each attempt regardless of outcome, so it can't accumulate into a
 * stuck state.
 */

const STORAGE_KEY = 'auracle.lastAuthAttempt';
const MIN_RETRY_INTERVAL_MS = 2_000;

function readLastAttempt(): number | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeLastAttempt(timestamp: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(timestamp));
  } catch {
    /* ignore storage errors (private mode, quota, etc.) */
  }
}

export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Too many attempts. Please wait ${Math.ceil(retryAfterMs / 1000)}s before trying again.`);
  }
}

/** Throws RateLimitError if the caller is submitting auth requests too fast. */
export function checkAuthRateLimit(): void {
  const now = Date.now();
  const lastAttempt = readLastAttempt();
  if (lastAttempt !== undefined && now - lastAttempt < MIN_RETRY_INTERVAL_MS) {
    throw new RateLimitError(MIN_RETRY_INTERVAL_MS - (now - lastAttempt));
  }
  writeLastAttempt(now);
}

export function resetAuthRateLimit(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
