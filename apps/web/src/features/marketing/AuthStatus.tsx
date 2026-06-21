import type { AuthUser } from '@auracle/shared';
import { useEffect, useRef, useState } from 'react';
import styles from './AuthStatus.module.css';

interface AuthStatusProps {
  user: AuthUser;
  onLogout: () => void;
}

type AccountView = 'overview' | 'profile' | 'preferences';

interface AccountPreferences {
  defaultMood: 'Focus' | 'Chill' | 'Energy';
}

const DEFAULT_PREFERENCES: AccountPreferences = {
  defaultMood: 'Focus',
};

function getInitialPreferences(userId: string): AccountPreferences {
  try {
    const raw = window.localStorage.getItem(`auracle-account-preferences:${userId}`);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AccountPreferences>;
    return {
      defaultMood: parsed.defaultMood ?? DEFAULT_PREFERENCES.defaultMood,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function AuthStatus({ user, onLogout }: AuthStatusProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AccountView>('overview');
  const [preferences, setPreferences] = useState<AccountPreferences>(() => getInitialPreferences(user.id));
  const [saved, setSaved] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setPreferences(getInitialPreferences(user.id));
    setView('overview');
  }, [user.id]);

  function updatePreferences(next: AccountPreferences) {
    setPreferences(next);
    window.localStorage.setItem(`auracle-account-preferences:${user.id}`, JSON.stringify(next));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return (
    <div className={styles.account} ref={rootRef}>
      <button
        className={styles.avatarButton}
        type="button"
        aria-label="Open Auracle account"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar} aria-hidden>
          {initials}
        </span>
      </button>

      {open && (
        <section className={styles.panel} aria-label="Auracle account profile">
          <div className={styles.panelHeader}>
            <span className={styles.avatarLarge} aria-hidden>
              {initials}
            </span>
            <div className={styles.identity}>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>

          {view === 'overview' && (
            <>
              <div className={styles.meta}>
                <span>Auracle account</span>
                <strong>{user.id === 'guest' ? 'Guest session' : 'Personal station'}</strong>
              </div>

              <div className={styles.menuList}>
                <button type="button" onClick={() => setView('profile')}>
                  <span>Profile</span>
                  <small>Name and sign-in</small>
                </button>
                <button type="button" onClick={() => setView('preferences')}>
                  <span>Listening preferences</span>
                  <small>{preferences.defaultMood} mood</small>
                </button>
                <div className={styles.activity}>
                  <span>Recent activity</span>
                  <strong>Quiet Hours</strong>
                  <small>1 station session · demo catalog</small>
                </div>
              </div>
            </>
          )}

          {view === 'profile' && (
            <div className={styles.detail}>
              <button className={styles.backButton} type="button" onClick={() => setView('overview')}>
                Account
              </button>
              <div className={styles.infoRows}>
                <span>
                  <small>Name</small>
                  <strong>{user.name}</strong>
                </span>
                <span>
                  <small>Email</small>
                  <strong>{user.email}</strong>
                </span>
                <span>
                  <small>Session</small>
                  <strong>{user.id === 'guest' ? 'Guest mode' : 'Signed in'}</strong>
                </span>
              </div>
            </div>
          )}

          {view === 'preferences' && (
            <div className={styles.detail}>
              <button className={styles.backButton} type="button" onClick={() => setView('overview')}>
                Preferences
              </button>
              <div className={styles.preferenceGroup}>
                <span>Default station mood</span>
                <div className={styles.segmented} aria-label="Default station mood">
                  {(['Focus', 'Chill', 'Energy'] as const).map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      className={preferences.defaultMood === mood ? styles.selected : undefined}
                      onClick={() => updatePreferences({ ...preferences, defaultMood: mood })}
                    >
                      {mood}
                    </button>
                  ))}
                </div>
              </div>
              {saved && <p className={styles.savedText}>Saved</p>}
            </div>
          )}

          <button className={styles.logoutButton} type="button" onClick={onLogout}>
            Log out
          </button>
        </section>
      )}
    </div>
  );
}
