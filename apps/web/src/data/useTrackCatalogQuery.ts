import { useQuery } from '@tanstack/react-query';
import { loadTrackCatalog } from '@/data/trackCatalog';
import { queryKeys } from '@/shared/query/keys';

/** Bootstraps the offline track catalog cache once per session. */
export function useTrackCatalogBootstrap(): void {
  useQuery({
    queryKey: queryKeys.trackCatalog,
    queryFn: async () => {
      await loadTrackCatalog();
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}
