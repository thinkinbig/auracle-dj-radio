/** Offline catalog manifest (`data/catalog/manifest.json`). */
export interface CatalogArtist {
  id: string;
  name: string;
  persona: string;
  /** Who the pun riffs on — for offline prompts only, never shown in UI. */
  punOf: string;
  /** Visual language of the referenced era/act; no celebrity likeness. */
  visualHomage: string;
  /**
   * Vocal era and technique for offline music prompts — same rule as visualHomage:
   * evoke register, phrasing, and production of the reference era, never impersonate a real voice.
   */
  vocalHomage?: string;
  /** Relative to `data/artists/`, e.g. `a-lana-delay.jpg`. */
  photoFile: string;
  /** Optional override for artist-photo generation (press-portrait subject). */
  photoSubject?: string;
  /** Stable URL-safe slug for structured taste. */
  slug?: string;
}

export interface CatalogAlbum {
  id: string;
  artistId: string;
  title: string;
  concept: string;
  /** Offline music-generation direction. Keeps display concept free for UI/worldbuilding. */
  sonicBrief?: string;
  /** Relative to repo `data/covers/`, e.g. `alb-lumen-midnight.svg`. */
  coverFile: string;
  /** Optional override for cover background generation. */
  coverSubject?: string;
  /** Stable URL-safe slug for structured taste. */
  slug?: string;
}

export interface CatalogTrack {
  id: string;
  albumId: string;
  title: string;
  energy: 1 | 2 | 3 | 4 | 5;
  tempo: number;
  genre: string;
  mood: string;
  scene: string;
  filePath: string;
  introOffsetMs: number | null;
  lore: string;
  /** Offline music-generation direction. More concrete than display lore. */
  sonicBrief?: string;
  /** When false, generate with vocals. Defaults to true (instrumental). */
  instrumental?: boolean;
  /** Optional lyrics for vocal tracks. If omitted, MiniMax lyrics_optimizer is used. */
  lyrics?: string;
  /** Taxonomy slug for `genre` (see `genre_taxonomy.json`). */
  genreSlug?: string;
}

export interface CatalogManifest {
  artists: CatalogArtist[];
  albums: CatalogAlbum[];
  tracks: CatalogTrack[];
}

/** A user-facing genre choice in `genre_taxonomy.json`. */
export interface GenreTaxonomyEntry {
  slug: string;
  label: string;
}

/**
 * Structured-taste genre taxonomy (`data/catalog/genre_taxonomy.json`).
 * `mapping` is a manual, checked-in table from each manifest `genre` tag to a
 * taxonomy slug — no LLM clustering (taxonomy v1).
 */
export interface GenreTaxonomy {
  genres: GenreTaxonomyEntry[];
  mapping: Record<string, string>;
}

/** A taxonomy entry plus how many catalog tracks map to it (GET /catalog/genres). */
export interface GenreCount extends GenreTaxonomyEntry {
  count: number;
}

/** Public track metadata returned by GET /tracks/:id (no embedding). */
export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  albumId: string;
  albumTitle: string;
  albumCoverUrl: string;
  artistPhotoUrl: string;
  lore: string;
  energy: 1 | 2 | 3 | 4 | 5;
  tempo: number;
  genre: string;
  /** Taxonomy slug for `genre` (structured taste). */
  genreSlug: string;
  /** Stable slug of the credited artist. */
  artistSlug: string;
  /** Stable slug of the album. */
  albumSlug: string;
  mood: string;
  scene: string;
  filePath: string;
  introOffsetMs: number | null;
}
