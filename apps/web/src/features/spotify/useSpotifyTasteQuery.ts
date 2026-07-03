import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/query/keys';
import { getSpotifyTasteProfile } from './spotifyTaste';

export function useSpotifyTasteQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.spotifyTaste,
    queryFn: getSpotifyTasteProfile,
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    retry: 1,
  });
}
