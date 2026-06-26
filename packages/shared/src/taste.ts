/**
 * Structured taste profile (Epic #3, S2). Shapes follow
 * `doc/auracle_structured_taste_design.md` §6.
 *
 * Preferences are keyed by *stable* identifiers so they survive a catalog
 * rebuild: a taxonomy slug for `genre`, the artist/album `slug` for those, and
 * the raw `trackId` for `track` (finest grain, most likely to orphan — §5).
 */
export type TasteEntityType = "genre" | "artist" | "album" | "track";
export type TastePolarity = "prefer" | "avoid";
export type TasteSource = "onboarding" | "search" | "session";
/** Resolution state filled in on read; not persisted (§6). */
export type TasteStatus = "active" | "orphaned";

export interface TastePreference {
  entityType: TasteEntityType;
  /** genre → taxonomy slug; artist/album → slug; track → trackId. */
  entityId: string;
  polarity: TastePolarity;
  strength?: 1 | 2 | 3;
  source: TasteSource;
  /** Filled on read against the live catalog; generally not persisted. */
  status?: TasteStatus;
  /** Current catalog id the stable `entityId` resolves to (artist/album), filled on read. */
  resolvedId?: string;
}

/** Persisted taste profile for one user. */
export interface TasteProfile {
  preferences: TastePreference[];
  /** Optional free-text taste note (mem0 / DJ colour, not structured). */
  freeText?: string;
  /** `catalogRevision` captured when the profile was last saved. */
  catalogRevisionAtSave?: string;
}

/** Body of PUT /users/me/taste. */
export interface SaveTasteRequest {
  preferences: TastePreference[];
  freeText?: string;
}

/** Response of GET / PUT /users/me/taste — the profile plus the live revision. */
export interface TasteProfileResponse extends TasteProfile {
  /** Live catalog revision at read time; compare with `catalogRevisionAtSave`. */
  catalogRevision: string;
}
