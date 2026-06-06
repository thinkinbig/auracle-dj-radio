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

/** Raw output shape of the Step-2 Flow model (Gemini Flash JSON). */
export interface FlowResult {
  session_title: string;
  session_subtitle: string;
  arc: ArcStage;
  tracklist: FlowTrackRef[];
}
