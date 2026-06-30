import type { AuthUser, ImportedPlaylistProfile } from '@auracle/shared';
import { isGuestUser } from '@/features/marketing/guest';

export interface MusicMemory {
  playlistCount: number;
  trackCount: number;
  updatedAt?: number;
}

type QueryLike = { isPending: boolean; isError: boolean };

export function resolveMusicMemory(playlists: ImportedPlaylistProfile[]): MusicMemory {
  return {
    playlistCount: playlists.length,
    trackCount: playlists.reduce((total, playlist) => total + playlist.trackCount, 0),
    updatedAt: playlists.reduce<number | undefined>((latest, playlist) => {
      if (latest === undefined) return playlist.createdAt;
      return Math.max(latest, playlist.createdAt);
    }, undefined),
  };
}

export function resolveProfileMemoryLines(user: AuthUser, memory: MusicMemory, query: QueryLike): string[] {
  if (isGuestUser(user)) return ['Demo catalog', 'No saved sound', 'Preview only'];
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
