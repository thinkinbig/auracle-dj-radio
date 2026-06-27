import type { FlowResult, SessionIntent, TrackCandidate } from "@auracle/shared";

export interface FlowInput {
  intent: SessionIntent;
  /** mem0 summary; "" until the memory slice lands. */
  memories: string;
  played: TrackCandidate[];
  /** Energy of the last already-played track; null on initial plan. */
  lastPlayedEnergy: number | null;
  remainingSlots: number;
  candidates: TrackCandidate[];
}
