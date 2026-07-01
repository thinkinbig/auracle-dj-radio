import type { ArcStage, SessionIntent, TrackCandidate } from "@auracle/shared";

/**
 * Internal, provider-agnostic tracklist slot the flow model / validation work on:
 * just an ordered reference into the candidate set. plan.ts stamps these into the
 * wire `PlannedTrack` (inline metadata + energy + voicing) once ordering is fixed.
 */
export interface FlowSlot {
  id: string;
  flow_position: number;
  reason: string;
}

/** Flow model output before metadata stamping. */
export interface FlowPlan {
  session_title: string;
  session_subtitle: string;
  arc: ArcStage;
  tracklist: FlowSlot[];
}

export interface FlowInput {
  intent: SessionIntent;
  /** mem0 summary; "" until the memory slice lands. */
  memories: string;
  played: TrackCandidate[];
  /** Energy of the last already-played track; null on initial plan. */
  lastPlayedEnergy: number | null;
  remainingSlots: number;
  candidates: TrackCandidate[];
  /** Session-scoped seed; changes per new session, stable within replan/refine. */
  tieBreakSeed?: string;
}
