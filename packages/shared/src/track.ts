/** Energy is an integer 1–5 (1 = lightest, 5 = most intense). */
export type Energy = 1 | 2 | 3 | 4 | 5;

/** A track in the offline library. */
export interface Track {
  id: string;
  title: string;
  /** Display name of the credited artist (denormalized). */
  artist: string;
  artistId: string;
  albumId: string;
  albumTitle: string;
  /** Short backstory for UI and curator-mode DJ cues. */
  lore: string;
  /** Offline music-generation direction from the manifest. */
  sonicBrief?: string;
  /** Repo-relative cover asset, e.g. `data/covers/alb-lumen-midnight.svg`. */
  albumCoverPath: string;
  /** Repo-relative artist photo, e.g. `data/artists/a-lana-delay.jpg`. */
  artistPhotoPath: string;
  energy: Energy;
  tempo: number; // BPM
  genre: string;
  /** Taxonomy slug for `genre` (structured taste; see `genre_taxonomy.json`). */
  genreSlug: string;
  /** Stable slug of the credited artist (denormalized from the manifest). */
  artistSlug: string;
  /** Stable slug of the album (denormalized from the manifest). */
  albumSlug: string;
  /** Display-only curator tag (UI + offline prompts). Selection uses `energy`. */
  mood: string;
  scene: string;
  filePath: string;
  introOffsetMs: number | null;
  /** When false, track was generated with vocals. Defaults to true. */
  instrumental: boolean;
  /** Optional lyrics used during vocal generation. */
  lyrics?: string;
  /** Offline-only: who the pun riffs on (for vocal prompts). */
  punOf?: string;
  /** Offline-only: vocal era/technique markers (for vocal prompts). */
  vocalHomage?: string;
  /** Artist persona blurb (manifest `artist.persona`) — vocal-prompt fallback + curator DJ context. */
  artistPersona?: string;
  /** Album concept blurb (manifest `album.concept`) — curator DJ context. */
  albumConcept?: string;
}

/** Flow/retrieval candidate — selection fields only (ADR-0001). */
export interface TrackCandidate {
  id: string;
  energy: Energy;
  tempo: number;
  genre: string;
  scene: string;
}

export function toCandidate(t: Track): TrackCandidate {
  return { id: t.id, energy: t.energy, tempo: t.tempo, genre: t.genre, scene: t.scene };
}
