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
  /** Proxy base URL the browser POSTs its WebRTC SDP offer to. */
  proxy_url: string;
  /** Per-session token, sent as X-Session-Token on the offer. */
  token: string;
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
