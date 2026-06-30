import type { AuthUser, ImportedPlaylistProfile, TastePreference } from '@auracle/shared';
import * as Popover from '@radix-ui/react-popover';
import { useEffect, useState } from 'react';
import { useImportedPlaylistsQuery } from '@/features/playlist-import/useImportedPlaylistsQuery';
import { deriveSessionMeta, hasStartedSession } from '@/features/radio/session/sessionDisplay';
import type { PlaybackState } from '@/features/radio/session/types';
import { useTasteQuery } from '@/features/sound/useTasteQuery';
import { useAuth } from '@/features/marketing/AuthProvider';
import styles from './AuthStatus.module.css';

interface AuthStatusProps {
  onLogout: () => void;
  onOpenListen: () => void;
  playback: PlaybackState;
}

type AccountView = 'overview' | 'profile';

interface MusicMemory {
  playlistCount: number;
  trackCount: number;
  updatedAt?: number;
}

export function AuthStatus({ onLogout, onOpenListen, playback }: AuthStatusProps) {
  const { user } = useAuth();
  if (!user) return null;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AccountView>('overview');
  const fetchProfile = open && user.id !== 'guest';
  const tasteQuery = useTasteQuery(fetchProfile);
  const playlistsQuery = useImportedPlaylistsQuery(fetchProfile);
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
  const tasteWords = tasteQuery.data ? resolveTasteWords(tasteQuery.data.preferences) : [];
  const musicMemory = playlistsQuery.data ? resolveMusicMemory(playlistsQuery.data.playlists) : { playlistCount: 0, trackCount: 0 };
  const resolvedTasteWords = profileTasteWords(user, tasteWords, tasteQuery);
  const memoryLines = profileMemoryLines(user, musicMemory, playlistsQuery);
  const accountStatus = user.id === 'guest' ? 'Demo station' : 'Signed in';

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
                <section className={styles.profileSection} aria-labelledby="profile-taste-title">
                  <p className={styles.sectionLabel} id="profile-taste-title">
                    Your Taste DNA
                  </p>
                  <div className={styles.tasteWords} aria-label="Taste DNA">
                    {resolvedTasteWords.map((word) => (
                      <span key={word}>{word}</span>
                    ))}
                  </div>
                </section>

                <section className={styles.profileSection} aria-labelledby="profile-memory-title">
                  <p className={styles.sectionLabel} id="profile-memory-title">
                    Music Memory
                  </p>
                  <div className={styles.memoryRows}>
                    {memoryLines.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                </section>

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

function resolveTasteWords(preferences: TastePreference[]): string[] {
  const active = preferences.filter((preference) => preference.status !== 'orphaned');
  const preferred = active.filter((preference) => preference.polarity === 'prefer');
  const source = preferred.length > 0 ? preferred : active;
  return source
    .sort((a, b) => (b.strength ?? 1) - (a.strength ?? 1))
    .slice(0, 3)
    .map((preference) =>
      preference.polarity === 'avoid' ? `Avoid ${humanizeTasteId(preference.entityId)}` : humanizeTasteId(preference.entityId),
    );
}

function humanizeTasteId(entityId: string): string {
  return entityId
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

function resolveMusicMemory(playlists: ImportedPlaylistProfile[]): MusicMemory {
  return {
    playlistCount: playlists.length,
    trackCount: playlists.reduce((total, playlist) => total + playlist.trackCount, 0),
    updatedAt: playlists.reduce<number | undefined>((latest, playlist) => {
      if (latest === undefined) return playlist.createdAt;
      return Math.max(latest, playlist.createdAt);
    }, undefined),
  };
}

type QueryLike = { isPending: boolean; isError: boolean };

function profileTasteWords(user: AuthUser, words: string[], query: QueryLike): string[] {
  if (user.id === 'guest') return ['Demo catalog', 'Guest mode', 'Fresh session'];
  if (query.isPending) return ['Syncing taste'];
  if (query.isError) return ['Taste sync pending'];
  return words.length > 0 ? words : ['No saved DNA yet'];
}

function profileMemoryLines(user: AuthUser, memory: MusicMemory, query: QueryLike): string[] {
  if (user.id === 'guest') return ['Demo catalog', 'No saved sound', 'Preview only'];
  if (query.isPending) return ['Syncing library', 'Reading playlists'];
  if (query.isError) return ['Memory sync pending', 'Try again later'];

  return [
    `${formatCount(memory.playlistCount)} ${memory.playlistCount === 1 ? 'playlist' : 'playlists'}`,
    `${formatCount(memory.trackCount)} ${memory.trackCount === 1 ? 'song' : 'songs'}`,
    memory.updatedAt ? formatUpdatedAt(memory.updatedAt) : 'No imports yet',
  ];
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatUpdatedAt(updatedAt: number): string {
  const days = Math.floor((Date.now() - updatedAt) / 86_400_000);
  if (days <= 0) return 'Updated today';
  if (days === 1) return 'Updated yesterday';
  if (days < 7) return `Updated ${days} days ago`;
  return `Updated ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(updatedAt))}`;
}
