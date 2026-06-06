import type { FlowTrackRef } from "./flow.js";
import type { HostMode } from "./host-mode.js";

/** Evaluation condition (doc/auracle_evaluation_design.md). C = full system. */
export type Condition = "A" | "B" | "C";

/** Response of POST /sessions. */
export interface CreateSessionResponse {
  session_id: string;
  session_title: string;
  session_subtitle: string;
  host_mode: HostMode;
  tracklist: FlowTrackRef[];
  mem0_context: string;
  /** False when Condition C starts but Qdrant is down — eval integrity signal. */
  mem0_available: boolean;
  live_ws_url: string;
}

/** Response of GET /sessions/:id. */
export interface SessionStateResponse {
  session_id: string;
  session_title: string;
  session_subtitle: string;
  host_mode: HostMode;
  current_track_index: number;
  tracklist: FlowTrackRef[];
  remaining: FlowTrackRef[];
  mem0_context: string;
}

/** Body of POST /sessions/:id/events. */
export interface SessionEvent {
  event_type: string;
  payload: Record<string, unknown>;
}
