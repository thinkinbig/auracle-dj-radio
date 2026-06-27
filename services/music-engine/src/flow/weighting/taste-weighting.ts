import type { TastePreference, TasteEntityType } from "@auracle/shared";

/**
 * Structured-taste retrieval scoring (Epic #3, S4).
 *
 * Priority order for retrieval is fixed:
 * 1. Mood energy envelope decides which energies are viable for the session.
 * 2. Structured taste reranks only within that envelope.
 * 3. mem0 energy skip weights are a tie-break / micro-adjustment only.
 *
 * This scorer implements step 2 only. It turns prefer/avoid preferences into a
 * bounded additive signal, matched via stable catalog slugs already present on
 * each track. Multiple matching prefs can contribute, but the final taste
 * signal is clamped so taste cannot overpower the mood envelope.
 *
 * Examples:
 * - `calm` + preferred artist still picks that artist's calm-adjacent tracks
 *   before the same artist's high-energy tracks.
 * - mem0 skip-energy penalties may break ties between similarly valid calm
 *   tracks, but they never pull a calm session toward euphoric energy.
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

/** Build an indexed scorer for the structured-taste rerank layer only. */
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
