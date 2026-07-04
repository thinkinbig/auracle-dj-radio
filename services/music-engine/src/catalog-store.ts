import type { Track, TrackMeta } from "@auracle/shared";
import { resolveCatalogPath, toTrackMeta, tracksWithAssets } from "./catalog/manifest.js";

// Catalog-only store: structured track metadata. Session analytics
// (session_events) belong to profile-service, not here (refactor-three-services).
export type TrackRow = Track;

/**
 * In-memory catalog. The on-disk manifest (`@auracle/catalog` →
 * packages/catalog/data) is the single source of truth, loaded fresh at boot.
 *
 * There is deliberately no derived SQLite copy to seed or keep in sync: the
 * catalog is a fixed static asset content-addressed by revision, and a few
 * thousand rows live in memory trivially. Collapsing the layer removes the
 * failure mode where the server is up but its catalog was never seeded — which
 * silently degraded every session to the client's demo fallback. Now an empty
 * catalog can only mean the manifest itself is empty, and the service refuses
 * to start (see index.ts) rather than serve empty tracklists.
 */
export class Catalog {
  private readonly tracks: TrackRow[];
  private readonly byId: Map<string, TrackRow>;

  constructor(tracks: TrackRow[]) {
    this.tracks = tracks;
    this.byId = new Map(tracks.map((t) => [t.id, t]));
  }

  /**
   * Load the catalog from the on-disk manifest, keeping only tracks whose
   * audio/cover/artist assets all exist, with asset paths resolved absolute
   * (identical shape to what the old seed script persisted).
   */
  static fromManifest(): Catalog {
    const tracks = tracksWithAssets().map((t) => ({
      ...t,
      filePath: resolveCatalogPath(t.filePath),
      albumCoverPath: resolveCatalogPath(t.albumCoverPath),
      artistPhotoPath: resolveCatalogPath(t.artistPhotoPath),
    }));
    return new Catalog(tracks);
  }

  allTracks(): TrackRow[] {
    return this.tracks;
  }

  getTrack(id: string): TrackRow | undefined {
    return this.byId.get(id);
  }

  getTrackMeta(id: string): TrackMeta | undefined {
    const track = this.byId.get(id);
    return track ? toTrackMeta(track) : undefined;
  }
}
