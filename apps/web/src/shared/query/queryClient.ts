import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export function clearUserQueries(): void {
  queryClient.removeQueries({ queryKey: queryKeys.spotifyTaste });
}

export function refreshSpotifyTasteQuery(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.spotifyTaste });
}
