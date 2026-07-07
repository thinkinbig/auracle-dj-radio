import * as Popover from '@radix-ui/react-popover';
import { useEffect, useState } from 'react';
import { deriveSessionMeta, hasStartedSession } from '@/features/radio/session/sessionDisplay';
import type { PlaybackState } from '@/features/radio/session/types';
import { isGuestUser, isSpotifyUser } from '@/features/marketing/guest';
import { useAuth } from '@/features/marketing/AuthProvider';
import styles from './AuthStatus.module.css';

interface AuthStatusProps {
  onLogout: () => void;
  onOpenListen: () => void;
  playback: PlaybackState;
}

type AccountView = 'overview' | 'profile';

export function AuthStatus({ onLogout, onOpenListen, playback }: AuthStatusProps) {
  const { user } = useAuth();
  if (!user) return null;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AccountView>('overview');
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';

  useEffect(() => {
    setView('overview');
  }, [user.id]);

  const hasSession = hasStartedSession(playback);
  const { title: sessionTitle, meta: sessionMeta, action: sessionAction } = deriveSessionMeta(hasSession, playback);
  const hasSpotifyTaste = isSpotifyUser(user);
  const tasteWords = isGuestUser(user) ? ['Demo catalog', 'Guest mode', 'Fresh session'] : ['Spotify taste', 'Live session', 'No Auracle profile'];
  const accountStatus = isGuestUser(user) ? 'Demo station' : 'Signed in';

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={styles.account}>
        <Popover.Trigger asChild>
          <button
            className={styles.avatarButton}
            type="button"
            aria-label="Open Auracle account and shortcuts"
          >
            <span className={styles.avatar} aria-hidden>
              {initials}
            </span>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content className={styles.panel} sideOffset={10} align="end" aria-label="Auracle account profile">
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
              <div className={styles.profileSections}>
                {hasSpotifyTaste || isGuestUser(user) ? (
                  <section className={styles.profileSection} aria-labelledby="profile-taste-title">
                    <p className={styles.sectionLabel} id="profile-taste-title">
                      Your Taste DNA
                    </p>
                    <div className={styles.tasteWords} aria-label="Taste DNA">
                      {tasteWords.map((word) => (
                        <span key={word}>{word}</span>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className={styles.profileSection} aria-labelledby="profile-session-title">
                  <div className={styles.sectionActionRow}>
                    <div>
                      <p className={styles.sectionLabel} id="profile-session-title">
                        Last Session
                      </p>
                      <strong>{sessionTitle}</strong>
                      <small>{sessionMeta}</small>
                    </div>
                    <button
                      className={styles.textAction}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onOpenListen();
                      }}
                    >
                      {sessionAction}
                      <span aria-hidden>→</span>
                    </button>
                  </div>
                </section>

                <section className={styles.profileSection} aria-labelledby="profile-account-title">
                  <div className={styles.sectionActionRow}>
                    <div>
                      <p className={styles.sectionLabel} id="profile-account-title">
                        Account
                      </p>
                      <strong>{accountStatus}</strong>
                    </div>
                    <button className={styles.textAction} type="button" onClick={() => setView('profile')}>
                      Manage account
                      <span aria-hidden>→</span>
                    </button>
                  </div>
                </section>
              </div>
            )}

            {view === 'profile' && (
              <div className={styles.detail}>
                <button className={styles.backButton} type="button" onClick={() => setView('overview')}>
                  Profile
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
                    <strong>{accountStatus}</strong>
                  </span>
                </div>
              </div>
            )}

            <button className={styles.logoutButton} type="button" onClick={onLogout}>
              Log out
            </button>
          </Popover.Content>
        </Popover.Portal>
      </div>
    </Popover.Root>
  );
}
