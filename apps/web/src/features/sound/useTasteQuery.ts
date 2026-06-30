import { useQuery } from '@tanstack/react-query';
import { fetchTaste } from './tasteApi';
import { queryKeys } from '@/shared/query/keys';

export function useTasteQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.taste,
    queryFn: fetchTaste,
    enabled,
  });
}
