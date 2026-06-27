import type { PlaylistImportListResponse, PlaylistImportRequest, PlaylistImportResponse } from '@auracle/shared';
import { jsonAuthHeaders } from '@/features/marketing/authApi';

class PlaylistImportApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new PlaylistImportApiError(body?.error ?? 'Request failed', res.status);
  }
  return (await res.json()) as T;
}

export async function fetchImportedPlaylists(): Promise<PlaylistImportListResponse> {
  return parse<PlaylistImportListResponse>(await fetch('/users/me/playlists', { headers: jsonAuthHeaders() }));
}

export async function saveImportedPlaylist(request: PlaylistImportRequest): Promise<PlaylistImportResponse> {
  return parse<PlaylistImportResponse>(
    await fetch('/users/me/playlists', {
      method: 'POST',
      headers: jsonAuthHeaders(),
      body: JSON.stringify(request),
    }),
  );
}

export function describePlaylistImportError(err: unknown): string {
  return err instanceof PlaylistImportApiError ? err.message : 'Could not save this playlist. Check your connection and try again.';
}
