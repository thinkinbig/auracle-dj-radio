import type { TastePreference, TasteEntityType } from "@auracle/shared";

/**
 * Structured-taste retrieval weighting (Epic #3, S4). Turns a user's prefer/avoid
 * preferences into a per-track score multiplier applied during Step 1 retrieval,
 * so taste measurably shifts the candidate pool (and therefore the final plan),
 * not just DJ narration.
 *
 * Conflict rule (design §6): the most *specific* matching preference wins —
 * track > album > artist > genre. Preferences are matched by the stable slug
 * fields the catalog already carries, so they survive a catalog rebuild.
 */

/** prefer multiplier = 1 + PREFER_STEP·strength (strength 1–3, default 2). */
const PREFER_STEP = 0.3;
/** avoid multiplier = max(MIN_MULT, 1 − AVOID_STEP·strength) — decisive enough to drop tracks below the top-K cut. */
const AVOID_STEP = 0.3;
const MIN_MULT = 0.05;
const DEFAULT_STRENGTH = 2;

/** Minimal track view needed to match preferences (a TrackRow satisfies this). */
export interface WeightableTrack {
  id: string;
  genreSlug: string;
  artistSlug: string;
  albumSlug: string;
}

export interface TasteWeighting {
  /** True when there are no preferences — callers can skip the multiplier entirely. */
  readonly empty: boolean;
  /** Score multiplier for one track from its most specific matching preference (1 = no effect). */
  multiplierFor(track: WeightableTrack): number;
}

function multiplier(pref: TastePreference): number {
  const strength = pref.strength ?? DEFAULT_STRENGTH;
  if (pref.polarity === "prefer") return 1 + PREFER_STEP * strength;
  return Math.max(MIN_MULT, 1 - AVOID_STEP * strength);
}

/** Build an indexed weighting from a user's (active) preferences. */
export function buildTasteWeighting(prefs: TastePreference[]): TasteWeighting {
  const byType: Record<TasteEntityType, Map<string, TastePreference>> = {
    track: new Map(),
    album: new Map(),
    artist: new Map(),
    genre: new Map(),
  };
  for (const pref of prefs) byType[pref.entityType].set(pref.entityId, pref);

  return {
    empty: prefs.length === 0,
    multiplierFor(track) {
      const match =
        byType.track.get(track.id) ??
        byType.album.get(track.albumSlug) ??
        byType.artist.get(track.artistSlug) ??
        byType.genre.get(track.genreSlug);
      return match ? multiplier(match) : 1;
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
