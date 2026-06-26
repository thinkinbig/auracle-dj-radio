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
  /** Set by plan.ts on retry after validate failures — fed into Gemini prompt. */
  repairHint?: string;
}

/** Step 2 — orders candidates into an energy-arc tracklist. */
export interface FlowModel {
  plan(input: FlowInput): Promise<FlowResult>;
}
