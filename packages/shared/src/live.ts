import type { FlowTrackRef } from "./flow.js";

/**
 * Live WS protocol (doc/auracle_api_protocol.md §Live WebSocket).
 * Defined now so api/web share one contract; the relay is built in a later slice.
 */
export type Phase = "dj_turn_start" | "dj_turn_end" | "user_barge_in" | "user_barge_end";

/** Between-track DJ intents surfaced by Gemini Live function calling. */
export type Intent =
  | { type: "skip_track" }
  | { type: "mood_change"; mood: string; energy_delta: "lighter" | "heavier" | "same" }
  | { type: "pause_playback"; action: "pause" | "resume" }
  | { type: "record_preference"; fact: string };

/** Client → server WS messages (JSON frames; audio is sent as raw binary). */
export type ClientMessage =
  | { type: "cue_dj"; track_index: number }
  | { type: "ping" };

/** Server → client WS messages (JSON frames; DJ audio is sent as raw binary). */
export type ServerMessage =
  | { type: "transcript"; role: "user" | "model"; text: string }
  | { type: "phase"; phase: Phase; track_index: number }
  | { type: "tracklist_updated"; remaining: FlowTrackRef[] }
  | { type: "intent"; intent: Intent }
  | { type: "error"; message: string };
