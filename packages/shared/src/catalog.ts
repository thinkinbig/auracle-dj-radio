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
}

export interface CatalogAlbum {
  id: string;
  artistId: string;
  title: string;
  concept: string;
  /** Relative to repo `data/covers/`, e.g. `alb-lumen-midnight.svg`. */
  coverFile: string;
  /** Optional override for cover background generation. */
  coverSubject?: string;
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
  /** When false, generate with vocals. Defaults to true (instrumental). */
  instrumental?: boolean;
  /** Optional lyrics for vocal tracks. If omitted, MiniMax lyrics_optimizer is used. */
  lyrics?: string;
}

export interface CatalogManifest {
  artists: CatalogArtist[];
  albums: CatalogAlbum[];
  tracks: CatalogTrack[];
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
  mood: string;
  scene: string;
  filePath: string;
  introOffsetMs: number | null;
}
