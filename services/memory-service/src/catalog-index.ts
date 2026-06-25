import { loadCatalogManifest, loadGenreTaxonomy, computeCatalogRevision } from "@auracle/catalog/manifest";
import { slugify, type CatalogManifest, type GenreTaxonomy, type TasteEntityType } from "@auracle/shared";

/**
 * Read-only view of the live catalog (S1) used to validate and resolve taste
 * preferences. Genre/track entities are validated by membership; artist/album
 * entities are keyed by stable `slug` and resolved to the current catalog `id`
 * (`doc/auracle_structured_taste_design.md` §4) — so a slug-based preference
 * survives a catalog rebuild even when ids change.
 */
export interface CatalogIndex {
  /** Current catalog revision (manifest content hash, see S1). */
  readonly revision: string;
  /**
   * Resolve a preference's stable `entityId` to a current catalog id.
   * Returns the resolved id for valid entities (the slug itself for genre, the
   * trackId for track, the current id for artist/album), or `undefined` when
   * the entity is unknown / orphaned.
   */
  resolve(entityType: TasteEntityType, entityId: string): string | undefined;
}

/** Build a snapshot index from an in-memory manifest + taxonomy. */
export function buildCatalogIndex(
  manifest: CatalogManifest,
  taxonomy: GenreTaxonomy,
  revision: string,
): CatalogIndex {
  const genreSlugs = new Set(taxonomy.genres.map((g) => g.slug));
  const trackIds = new Set(manifest.tracks.map((t) => t.id));
  // slug → current id. Fall back to slugify(name/title) for any row that
  // predates the S1 backfill, mirroring how the manifest join derives slugs.
  const artistBySlug = new Map(manifest.artists.map((a) => [a.slug ?? slugify(a.name), a.id]));
  const albumBySlug = new Map(manifest.albums.map((a) => [a.slug ?? slugify(a.title), a.id]));

  return {
    revision,
    resolve(entityType, entityId) {
      switch (entityType) {
        case "genre":
          return genreSlugs.has(entityId) ? entityId : undefined;
        case "track":
          return trackIds.has(entityId) ? entityId : undefined;
        case "artist":
          return artistBySlug.get(entityId);
        case "album":
          return albumBySlug.get(entityId);
        default:
          return undefined;
      }
    },
  };
}

/** Load the index from the bundled `@auracle/catalog` manifest + taxonomy. */
export function loadCatalogIndex(): CatalogIndex {
  return buildCatalogIndex(loadCatalogManifest(), loadGenreTaxonomy(), computeCatalogRevision());
}
