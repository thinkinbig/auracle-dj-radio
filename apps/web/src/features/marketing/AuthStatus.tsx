import type { AuthUser } from '@auracle/shared';
import { useEffect, useRef, useState } from 'react';
import styles from './AuthStatus.module.css';

interface AuthStatusProps {
  user: AuthUser;
  onLogout: () => void;
  onOpenSound: () => void;
}

type AccountView = 'overview' | 'profile';

export function AuthStatus({ user, onLogout, onOpenSound }: AuthStatusProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AccountView>('overview');
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
    setView('overview');
  }, [user.id]);

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
                <strong>{user.id === 'guest' ? 'Demo station' : 'Your station'}</strong>
              </div>

              <div className={styles.menuList}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenSound();
                  }}
                >
                  <span>Sound</span>
                  <small>Taste engineering — genres, learned prefs, signals</small>
                </button>
                <button type="button" onClick={() => setView('profile')}>
                  <span>Profile</span>
                  <small>Name and sign-in</small>
                </button>
                <div className={styles.activity}>
                  <span>Recent activity</span>
                  <strong>{user.id === 'guest' ? 'Guest listening' : 'Session history'}</strong>
                  <small>{user.id === 'guest' ? 'Demo catalog · no saved sound' : 'Ships with session history'}</small>
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

          <button className={styles.logoutButton} type="button" onClick={onLogout}>
            Log out
          </button>
        </section>
      )}
    </div>
  );
}
