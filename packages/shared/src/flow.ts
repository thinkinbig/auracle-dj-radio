import type { ArcStage } from "./arc.js";
import type { Energy } from "./track.js";

/** Open-ended session intent from the listener (POST /sessions body). */
export interface SessionIntent {
  mood: string;
  scene: string;
  duration_min: number;
}

/**
 * DJ voicing blurbs a track carries — what the host borrows a phrase from on air.
 * For a catalog track these come straight from the manifest; for an externally
 * seeded track music-engine reuses a matching catalog voicing or LLM-improvises
 * one from title/artist. Provider-agnostic (no separate Spotify shape).
 */
export interface Voicing {
  artistPersona: string;
  albumConcept: string;
  lore: string;
}

/**
 * An externally-sourced candidate the catalog doesn't own (e.g. a listener's
 * Spotify library). Self-describing because there is no catalog entry to resolve
 * by id. Provider-agnostic: any external backend seeds the same shape. `uri`
 * carries the playback scheme (`spotify:track:...`).
 */
export interface TrackSeed {
  uri: string;
  title: string;
  artist: string;
  albumTitle: string;
  albumCoverUrl: string;
  durationSec: number;
}

/**
 * One ordered, fully self-describing slot in a planned tracklist. There is no
 * per-slot provider branch: `id` is the stable join/diff key (bare catalog id
 * for a catalog track, the uri for a seeded one) and `uri` is the playback
 * locator whose scheme selects the backend — `local:<id>` or `spotify:track:...`.
 * Only the audio player reads the scheme; every layer above treats a slot
 * uniformly. Energy and voicing are always resolved by music-engine (a
 * provisional slot may carry placeholder values that the full plan fills in).
 */
export interface PlannedTrack {
  id: string;
  uri: string;
  flow_position: number;
  reason: string;
  title: string;
  artist: string;
  albumTitle: string;
  albumCoverUrl: string;
  durationSec: number;
  energy: Energy;
  voicing: Voicing;
}

/** Output shape of deterministic Step-2 flow planning plus async copy text. */
export interface FlowResult {
  session_title: string;
  session_subtitle: string;
  arc: ArcStage;
  tracklist: PlannedTrack[];
}
