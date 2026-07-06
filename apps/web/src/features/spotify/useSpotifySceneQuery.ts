import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/query/keys';
import { getSuggestedScene } from './spotifyScene';

export function useSpotifySceneQuery() {
  return useQuery({
    queryKey: queryKeys.spotifyScene,
    queryFn: getSuggestedScene,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
