import type { TastePolarity, TastePreference } from "@auracle/shared";
import type { CatalogIndex } from "../catalog-index.js";

/** Like/dislike on a playing track (the `playlist_feedback` DJ tool, minus regenerate). */
export type SessionFeedback = "like" | "dislike";

export function parseSessionFeedback(raw: unknown): SessionFeedback | undefined {
  return raw === "like" || raw === "dislike" ? raw : undefined;
}

/**
 * Derive the session-sourced prefs a like/dislike rolls up to (#69): the track
 * itself (strength 2, finest grain) plus its artist (strength 1, so one track
 * reaction only tie-breaks the artist until it recurs). Genre is deliberately
 * not written — a single reaction is too weak a signal for a genre-wide swing
 * (genre fit is a full retrieval boost, not a tie-break). Returns [] when the
 * track has no catalog identity (e.g. a Spotify queue item).
 */
export function feedbackPreferences(trackId: string, feedback: SessionFeedback, catalog: CatalogIndex): TastePreference[] {
  const entities = catalog.trackEntities(trackId);
  if (!entities) return [];
  const polarity: TastePolarity = feedback === "like" ? "prefer" : "avoid";
  const prefs: TastePreference[] = [{ entityType: "track", entityId: trackId, polarity, strength: 2, source: "session" }];
  if (entities.artistSlug) {
    prefs.push({ entityType: "artist", entityId: entities.artistSlug, polarity, strength: 1, source: "session" });
  }
  return prefs;
}
