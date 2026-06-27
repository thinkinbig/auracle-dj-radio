import type { FlowTrackRef } from "./flow.js";
import type { HostMode } from "./host-mode.js";

/**
 * Live session protocol. Inbound frames (ServerMessage) cross the browser↔proxy
 * WebRTC data channel (decoded by web/rtcProtocol); client→server control now goes
 * over HTTP to memory-service, so there is no ClientMessage type.
 */
export type Phase = "dj_turn_start" | "dj_turn_end" | "user_barge_in";

/** Between-track DJ intents surfaced by Gemini Live function calling. */
export type Intent =
  | { type: "skip_track" }
  | { type: "mood_change"; mood: string; energy_delta: "lighter" | "heavier" | "same" }
  | { type: "host_mode_changed"; host_mode: HostMode }
  | { type: "pause_playback"; action: "pause" | "resume" }
  | { type: "record_preference"; fact: string };

/** Server → client frames (decoded from the WebRTC data channel; DJ audio is the media track). */
export type ServerMessage =
  | { type: "transcript"; role: "user" | "model"; text: string }
  | { type: "phase"; phase: Phase; track_index: number }
  | {
      type: "tracklist_updated";
      remaining: FlowTrackRef[];
      session_title?: string;
      session_subtitle?: string;
      /** Ids of slots changed in this update, for UI highlight (deterministic skip-swap, E4). */
      changed_ids?: string[];
    }
  | { type: "intent"; intent: Intent }
  | { type: "error"; message: string; circuit_state?: string; retry_after_sec?: number };
