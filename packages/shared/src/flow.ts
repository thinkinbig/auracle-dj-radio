import type { ArcStage } from "./arc.js";

/** Open-ended session intent from the listener (POST /sessions body). */
export interface SessionIntent {
  mood: string;
  scene: string;
  duration_min: number;
}

/** Which playback backend owns a slot. Absent ⇒ local (backward-compatible). ADR-0005. */
export type TrackSource = "local" | "spotify";

/**
 * Self-describing metadata for a Spotify-backed slot. Carried inline because a
 * Spotify track has no local catalog entry to resolve by `id` (ADR-0005 §7).
 */
export interface SpotifyTrackRef {
  uri: string;
  title: string;
  artist: string;
  albumTitle: string;
  albumCoverUrl: string;
  durationSec: number;
}

/** One ordered slot in a planned tracklist. */
export interface FlowTrackRef {
  id: string;
  flow_position: number;
  reason: string;
  /** Playback backend for this slot; absent means local. ADR-0005. */
  source?: TrackSource;
  /** Present only when `source === "spotify"` — inline metadata (no catalog entry). */
  spotify?: SpotifyTrackRef;
}

/** Output shape of deterministic Step-2 flow planning plus async copy text. */
export interface FlowResult {
  session_title: string;
  session_subtitle: string;
  arc: ArcStage;
  tracklist: FlowTrackRef[];
}
