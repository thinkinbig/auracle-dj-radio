import type { PlannedTrack } from "./flow.js";
import type { HostMode } from "./host-mode.js";
import type { PlaylistFeedback } from "./live.js";

/** Evaluation condition (doc/auracle_evaluation_design.md). C = full system. */
export type Condition = "A" | "B" | "C";

/** Response of POST /sessions. */
export interface CreateSessionResponse {
  session_id: string;
  session_title: string;
  session_subtitle: string;
  host_mode: HostMode;
  tracklist: PlannedTrack[];
  personalization_context: string;
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
  tracklist: PlannedTrack[];
  remaining: PlannedTrack[];
  personalization_context: string;
}

/** Regenerate payload nested in POST /sessions/:id/playlist-feedback when feedback is regenerate. */
export interface RegenerateSessionResponse {
  ok: boolean;
  replanned: boolean;
  session_title: string;
  session_subtitle: string;
  current_track_index: number;
  tracklist: PlannedTrack[];
  remaining: PlannedTrack[];
  changed_ids?: string[];
  before_remaining_ids?: string[];
}

/** Response of POST /sessions/:id/playlist-feedback. */
export interface PlaylistFeedbackResponse {
  ok: boolean;
  feedback: PlaylistFeedback;
  regenerate?: RegenerateSessionResponse;
}

/** Body of POST /sessions/:id/events. */
export interface SessionEvent {
  event_type: string;
  payload: Record<string, unknown>;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** Fallback memory/analytics identity for unauthenticated (demo) sessions. */
export const ANONYMOUS_USER_ID = "auracle_anonymous";

/** Parse `Authorization: Bearer <token>`; returns undefined when absent or malformed. */
export function parseBearerToken(authorization?: string): string | undefined {
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends AuthCredentials {
  name?: string;
}
