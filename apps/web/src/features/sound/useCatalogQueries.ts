import { useQuery } from '@tanstack/react-query';
import { loadBrowseCatalog, loadGenres } from './catalogBrowse';
import { queryKeys } from '@/shared/query/keys';

export function useGenresQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.genres,
    queryFn: loadGenres,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useBrowseCatalogQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.browseCatalog,
    queryFn: loadBrowseCatalog,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
