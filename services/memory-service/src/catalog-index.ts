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
  /**
   * Human-readable display name for an `entityId` (genre label, artist name,
   * album/track title). Falls back to the raw `entityId` when the entity is
   * unknown / orphaned.
   */
  label(entityType: TasteEntityType, entityId: string): string;
  /**
   * Stable taste entities a catalog track rolls up to (artist slug via the
   * album join, genre taxonomy slug), for session-feedback prefs (#69).
   * `undefined` when the track is unknown — e.g. an external (Spotify) queue
   * item, which has no stable catalog identity to hang a preference on.
   */
  trackEntities(trackId: string): { artistSlug?: string; genreSlug?: string } | undefined;
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

  // entityId → display name, for human-readable taste/profile summaries.
  const genreLabels = new Map(taxonomy.genres.map((g) => [g.slug, g.label]));
  const artistNames = new Map(manifest.artists.map((a) => [a.slug ?? slugify(a.name), a.name]));
  const albumTitles = new Map(manifest.albums.map((a) => [a.slug ?? slugify(a.title), a.title]));
  const trackTitles = new Map(manifest.tracks.map((t) => [t.id, t.title]));

  // trackId → stable rollup entities (artist slug via album join, genre taxonomy slug).
  const artistSlugById = new Map(manifest.artists.map((a) => [a.id, a.slug ?? slugify(a.name)]));
  const albumArtistId = new Map(manifest.albums.map((a) => [a.id, a.artistId]));
  const trackRollups = new Map(
    manifest.tracks.map((t) => {
      const artistId = albumArtistId.get(t.albumId);
      const artistSlug = artistId !== undefined ? artistSlugById.get(artistId) : undefined;
      const genreSlug = t.genreSlug ?? taxonomy.mapping[t.genre];
      return [
        t.id,
        {
          ...(artistSlug !== undefined ? { artistSlug } : {}),
          ...(genreSlug !== undefined && genreSlugs.has(genreSlug) ? { genreSlug } : {}),
        },
      ];
    }),
  );

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
    label(entityType, entityId) {
      switch (entityType) {
        case "genre":
          return genreLabels.get(entityId) ?? entityId;
        case "artist":
          return artistNames.get(entityId) ?? entityId;
        case "album":
          return albumTitles.get(entityId) ?? entityId;
        case "track":
          return trackTitles.get(entityId) ?? entityId;
        default:
          return entityId;
      }
    },
    trackEntities(trackId) {
      return trackRollups.get(trackId);
    },
  };
}

/** Load the index from the bundled `@auracle/catalog` manifest + taxonomy. */
export function loadCatalogIndex(): CatalogIndex {
  return buildCatalogIndex(loadCatalogManifest(), loadGenreTaxonomy(), computeCatalogRevision());
}
