import type { TastePreference, TasteEntityType } from "@auracle/shared";

/**
 * Structured-taste retrieval scoring (Epic #3, S4). Turns a user's prefer/avoid
 * preferences into a bounded additive signal for retrieval reranking within the
 * mood energy envelope (ADR-0001). Matching uses stable slug fields the catalog
 * already carries. Multiple matching prefs can contribute, but the final taste
 * signal is clamped so taste cannot overpower the energy envelope.
 */

const DEFAULT_STRENGTH = 2;
const SCORE_BY_TYPE: Record<TasteEntityType, number> = {
  track: 1,
  album: 0.7,
  artist: 0.5,
  genre: 0.3,
};

/** Minimal track view needed to match preferences (a TrackRow satisfies this). */
export interface WeightableTrack {
  id: string;
  genreSlug: string;
  artistSlug: string;
  albumSlug: string;
}

export interface TasteScorer {
  /** True when there are no preferences — callers can skip scoring entirely. */
  readonly empty: boolean;
  /** Bounded taste score for one track: -1 = strong avoid, 0 = no signal, 1 = strong prefer. */
  scoreFor(track: WeightableTrack): number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function contribution(pref: TastePreference): number {
  const strength = clamp(pref.strength ?? DEFAULT_STRENGTH, 1, 3) / 3;
  const polarity = pref.polarity === "prefer" ? 1 : -1;
  return polarity * SCORE_BY_TYPE[pref.entityType] * strength;
}

/** Build an indexed scorer from a user's active preferences. */
export function buildTasteScorer(prefs: TastePreference[]): TasteScorer {
  const byType: Record<TasteEntityType, Map<string, TastePreference>> = {
    track: new Map(),
    album: new Map(),
    artist: new Map(),
    genre: new Map(),
  };
  for (const pref of prefs) byType[pref.entityType].set(pref.entityId, pref);

  return {
    empty: prefs.length === 0,
    scoreFor(track) {
      const matches = [
        byType.track.get(track.id),
        byType.album.get(track.albumSlug),
        byType.artist.get(track.artistSlug),
        byType.genre.get(track.genreSlug),
      ].filter((pref): pref is TastePreference => Boolean(pref));
      return clamp(matches.reduce((sum, pref) => sum + contribution(pref), 0), -1, 1);
    },
  };
}

/** Stable cache-key fragment so a taste change busts the plan cache. */
export function tasteCacheKey(prefs: TastePreference[] | undefined): string {
  if (!prefs || prefs.length === 0) return "";
  return prefs
    .map((p) => `${p.entityType}:${p.entityId}:${p.polarity}:${p.strength ?? DEFAULT_STRENGTH}`)
    .sort()
    .join(",");
}
