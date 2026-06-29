import type { FlowTrackRef } from "./flow.js";
import type { HostMode } from "./host-mode.js";

/**
 * Live session protocol. Inbound frames (ServerMessage) cross the browser↔proxy
 * WebRTC data channel (decoded by web/rtcProtocol); client→server control now goes
 * over HTTP to memory-service, so there is no ClientMessage type.
 */
export type Phase = "dj_turn_start" | "dj_turn_end" | "user_barge_in";

/** Rolling extend / regenerate queue refresh lifecycle (E6). */
export type QueueRefreshStatus = "idle" | "pending" | "complete" | "error";

/** Explicit listener reaction to the current track or queue (Like / Dislike / Regenerate UI). */
export type PlaylistFeedback = "like" | "dislike" | "regenerate";

/** Who initiated playlist feedback — UI HTTP or Live DJ tool. */
export type PlaylistFeedbackSource = "ui" | "dj_tool";

/** Between-track DJ intents surfaced by Gemini Live function calling. */
export type Intent =
  | { type: "skip_track" }
  | { type: "mood_change"; mood: string; energy_delta: "lighter" | "heavier" | "same" }
  | { type: "host_mode_changed"; host_mode: HostMode }
  | { type: "pause_playback"; action: "pause" | "resume" }
  | { type: "record_preference"; fact: string }
  | { type: "playlist_feedback"; feedback: PlaylistFeedback };

/** Server → client frames (decoded from the WebRTC data channel; DJ audio is the media track). */
export type ServerMessage =
  | { type: "transcript"; role: "user" | "model"; text: string }
  | { type: "phase"; phase: Phase; track_index: number }
  | {
      type: "tracklist_updated";
      remaining: FlowTrackRef[];
      session_title?: string;
      session_subtitle?: string;
      /** Ids of remaining tracks changed in this update, for queue diff highlighting. */
      changed_ids?: string[];
      /** Remaining track ids before the update; lets clients infer a diff when needed. */
      before_remaining_ids?: string[];
    }
  | { type: "queue_refresh"; status: QueueRefreshStatus }
  | { type: "intent"; intent: Intent }
  | { type: "error"; message: string; circuit_state?: string; retry_after_sec?: number }
  /**
   * The user started a live session on another device; this one has been
   * superseded (single active session per user). The client stops playback and
   * surfaces a non-crash "playing elsewhere" UX (issue #55).
   */
  | { type: "session_superseded" };
