import type { AuthUser, ImportedPlaylistProfile, TastePreference } from '@auracle/shared';
import { useEffect, useRef, useState } from 'react';
import type { PlaybackState } from '@/features/radio/session/types';
import { fetchImportedPlaylists } from '@/features/playlist-import/playlistImportApi';
import { fetchTaste } from '@/features/sound/tasteApi';
import styles from './AuthStatus.module.css';

interface AuthStatusProps {
  user: AuthUser;
  onLogout: () => void;
  onOpenListen: () => void;
  playback: PlaybackState;
}

type AccountView = 'overview' | 'profile';
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface MusicMemory {
  playlistCount: number;
  trackCount: number;
  updatedAt?: number;
}

export function AuthStatus({ user, onLogout, onOpenListen, playback }: AuthStatusProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AccountView>('overview');
  const [tasteWords, setTasteWords] = useState<string[]>([]);
  const [tasteState, setTasteState] = useState<LoadState>('idle');
  const [musicMemory, setMusicMemory] = useState<MusicMemory>({ playlistCount: 0, trackCount: 0 });
  const [musicMemoryState, setMusicMemoryState] = useState<LoadState>('idle');
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

  useEffect(() => {
    if (!open) return;

    if (user.id === 'guest') {
      setTasteWords([]);
      setTasteState('idle');
      setMusicMemory({ playlistCount: 0, trackCount: 0 });
      setMusicMemoryState('idle');
      return;
    }

    let cancelled = false;
    setTasteState('loading');
    setMusicMemoryState('loading');

    void fetchTaste()
      .then((profile) => {
        if (cancelled) return;
        setTasteWords(resolveTasteWords(profile.preferences));
        setTasteState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setTasteWords([]);
        setTasteState('error');
      });

    void fetchImportedPlaylists()
      .then(({ playlists }) => {
        if (cancelled) return;
        setMusicMemory(resolveMusicMemory(playlists));
        setMusicMemoryState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setMusicMemory({ playlistCount: 0, trackCount: 0 });
        setMusicMemoryState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [open, user.id]);

  const hasSession = playback.phase !== 'idle' || playback.sessionId !== null;
  const sessionTitle = hasSession ? playback.sessionTitle : 'No session yet';
  const sessionMeta = hasSession
    ? `${playback.sessionSubtitle} · ${formatSessionDuration(playback.sessionElapsedSec)}`
    : 'Choose a mood to begin';
  const sessionAction = hasSession ? 'Resume' : 'Start';
  const resolvedTasteWords = profileTasteWords(user, tasteWords, tasteState);
  const memoryLines = profileMemoryLines(user, musicMemory, musicMemoryState);
  const accountStatus = user.id === 'guest' ? 'Demo station' : 'Signed in';

  return (
    <div className={styles.account} ref={rootRef}>
      <button
        className={styles.avatarButton}
        type="button"
        aria-label="Open Auracle account and shortcuts"
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
        </section>
      )}
    </div>
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

function profileTasteWords(user: AuthUser, words: string[], state: LoadState): string[] {
  if (user.id === 'guest') return ['Demo catalog', 'Guest mode', 'Fresh session'];
  if (state === 'loading') return ['Syncing taste'];
  if (state === 'error') return ['Taste sync pending'];
  return words.length > 0 ? words : ['No saved DNA yet'];
}

function profileMemoryLines(user: AuthUser, memory: MusicMemory, state: LoadState): string[] {
  if (user.id === 'guest') return ['Demo catalog', 'No saved sound', 'Preview only'];
  if (state === 'loading') return ['Syncing library', 'Reading playlists'];
  if (state === 'error') return ['Memory sync pending', 'Try again later'];

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

function formatSessionDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} min`;
}
