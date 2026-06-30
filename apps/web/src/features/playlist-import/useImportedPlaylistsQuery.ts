import { useQuery } from '@tanstack/react-query';
import { fetchImportedPlaylists } from './playlistImportApi';
import { queryKeys } from '@/shared/query/keys';

export function useImportedPlaylistsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.playlists,
    queryFn: fetchImportedPlaylists,
    enabled,
  });
}
