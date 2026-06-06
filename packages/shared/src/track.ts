/** Energy is an integer 1–5 (1 = lightest, 5 = most intense). */
export type Energy = 1 | 2 | 3 | 4 | 5;

/** A track in the offline library. `embedding` lives only in the DB layer. */
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
  /** Repo-relative cover asset, e.g. `data/covers/alb-lumen-midnight.svg`. */
  albumCoverPath: string;
  /** Repo-relative artist photo, e.g. `data/artists/a-lana-delay.jpg`. */
  artistPhotoPath: string;
  energy: Energy;
  tempo: number; // BPM
  genre: string;
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
  /** Offline-only: artist persona blurb (for vocal prompt fallback). */
  artistPersona?: string;
}

/** The subset of track metadata handed to the Flow model as a candidate. */
export interface TrackCandidate {
  id: string;
  energy: Energy;
  tempo: number;
  genre: string;
  mood: string;
  scene: string;
}

export function toCandidate(t: Track): TrackCandidate {
  return { id: t.id, energy: t.energy, tempo: t.tempo, genre: t.genre, mood: t.mood, scene: t.scene };
}
