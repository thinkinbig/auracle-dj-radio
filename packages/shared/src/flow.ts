import type { ArcStage } from "./arc.js";

/** Open-ended session intent from the listener (POST /sessions body). */
export interface SessionIntent {
  mood: string;
  scene: string;
  duration_min: number;
}

/** One ordered slot in a planned tracklist. */
export interface FlowTrackRef {
  id: string;
  flow_position: number;
  reason: string;
}

/** Output shape of deterministic Step-2 flow planning plus async copy text. */
export interface FlowResult {
  session_title: string;
  session_subtitle: string;
  arc: ArcStage;
  tracklist: FlowTrackRef[];
}
