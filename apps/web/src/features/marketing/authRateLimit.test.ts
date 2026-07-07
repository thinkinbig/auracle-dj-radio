import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitError, checkAuthRateLimit, resetAuthRateLimit } from './authRateLimit';

function installFakeStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
  });
}

const MIN_RETRY_INTERVAL_MS = 2_000;

describe('checkAuthRateLimit', () => {
  beforeEach(() => {
    installFakeStorage();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('allows the first attempt', () => {
    expect(() => checkAuthRateLimit()).not.toThrow();
  });

  it('blocks an immediate second attempt (double-submit guard)', () => {
    checkAuthRateLimit();
    expect(() => checkAuthRateLimit()).toThrow(RateLimitError);
  });

  it('allows a second attempt once the minimum retry interval has passed', () => {
    checkAuthRateLimit();
    vi.advanceTimersByTime(MIN_RETRY_INTERVAL_MS);
    expect(() => checkAuthRateLimit()).not.toThrow();
  });

  it('does not accumulate a lockout across many spaced-out attempts', () => {
    // Repeated legitimate retries (e.g. correcting a mistyped password),
    // each past the retry interval, must never compound into a block —
    // there is no per-window cap, only "time since the last attempt".
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(MIN_RETRY_INTERVAL_MS);
      expect(() => checkAuthRateLimit()).not.toThrow();
    }
  });

  it('reports a retryAfterMs bounded by the retry interval', () => {
    checkAuthRateLimit();
    try {
      checkAuthRateLimit();
      throw new Error('expected checkAuthRateLimit to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      const retryAfterMs = (err as RateLimitError).retryAfterMs;
      expect(retryAfterMs).toBeGreaterThan(0);
      expect(retryAfterMs).toBeLessThanOrEqual(MIN_RETRY_INTERVAL_MS);
    }
  });

  it('resetAuthRateLimit clears the log so the next attempt is immediately allowed', () => {
    checkAuthRateLimit();
    expect(() => checkAuthRateLimit()).toThrow(RateLimitError);
    resetAuthRateLimit();
    expect(() => checkAuthRateLimit()).not.toThrow();
  });
});
