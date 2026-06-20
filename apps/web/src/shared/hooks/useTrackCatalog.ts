import { useSyncExternalStore } from 'react';
import {
  getTrackCatalogSnapshot,
  getTrackMeta,
  isCatalogLoaded,
  subscribeTrackCatalog,
  type TrackDisplay,
} from '@/data/trackCatalog';

function useTrackCatalogVersion(): number {
  return useSyncExternalStore(
    subscribeTrackCatalog,
    getTrackCatalogSnapshot,
    getTrackCatalogSnapshot,
  );
}

/** Track meta that re-renders when the catalog cache updates. */
export function useTrackMeta(id: string): TrackDisplay {
  useTrackCatalogVersion();
  return getTrackMeta(id);
}

/** Whether the bulk catalog fetch has populated the cache. */
export function useCatalogLoaded(): boolean {
  useTrackCatalogVersion();
  return isCatalogLoaded();
}
