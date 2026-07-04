/** Session-scoped taste delta used for current-queue feedback nudges. */
export type TasteEntityType = "genre" | "artist" | "album" | "track";
export type TastePolarity = "prefer" | "avoid";
export type TasteSource = "onboarding" | "search" | "session";

export interface TastePreference {
  entityType: TasteEntityType;
  /** genre → taxonomy slug; artist/album → slug; track → trackId. */
  entityId: string;
  polarity: TastePolarity;
  strength?: 1 | 2 | 3;
  source: TasteSource;
}
