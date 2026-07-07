import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_ALREADY_REGISTERED_MESSAGE } from './authErrors';

const signUp = vi.fn();
const mockClient = {
  auth: {
    signUp,
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockClient),
}));

function installFakeStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
    sessionStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    },
  });
}

async function loadAuthApi() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-anon-key');
  return import('./authApi');
}

describe('register', () => {
  beforeEach(() => {
    installFakeStorage();
    signUp.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rejects with EMAIL_ALREADY_REGISTERED_MESSAGE when signUp returns an obfuscated repeat-signup response', async () => {
    // Supabase's documented anti-enumeration behavior for signUp() on an
    // existing confirmed email: HTTP 200, error: null, session: null, and
    // an obfuscated user whose identities array is empty.
    signUp.mockResolvedValue({
      data: { user: { id: 'fake-id', identities: [] }, session: null },
      error: null,
    });
    const { register } = await loadAuthApi();

    await expect(register({ email: 'existing@example.com', password: 'Password1!' }, true)).rejects.toThrow(
      EMAIL_ALREADY_REGISTERED_MESSAGE,
    );
  });

  it('rejects with a confirm-your-email message for a genuine new signup awaiting confirmation', async () => {
    signUp.mockResolvedValue({
      data: {
        user: { id: 'new-id', identities: [{ identity_id: 'i1', provider: 'email' }] },
        session: null,
      },
      error: null,
    });
    const { register } = await loadAuthApi();

    await expect(register({ email: 'new@example.com', password: 'Password1!' }, true)).rejects.toThrow(
      'Check your email to confirm your account, then log in.',
    );
  });
});
