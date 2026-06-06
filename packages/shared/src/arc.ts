import type { Energy } from "./track.js";

/**
 * Energy arc for a full 8-track session (doc/auracle_flow_prompt_design.md §Step 2).
 * Warm-up 1–2: 1→2 · Build 3–4: 2→3 · Peak 5–6: 3→5 · Wind-down 7–8: 5→2.
 */
export type ArcStage = "warm_up" | "build" | "peak" | "wind_down";

export const FULL_SESSION_LENGTH = 8;

/** Target energy band per 1-based flow position in a full 8-track arc. */
export const ARC_BANDS: Record<number, { stage: ArcStage; min: Energy; max: Energy }> = {
  1: { stage: "warm_up", min: 1, max: 1 },
  2: { stage: "warm_up", min: 1, max: 2 },
  3: { stage: "build", min: 2, max: 3 },
  4: { stage: "build", min: 2, max: 3 },
  5: { stage: "peak", min: 3, max: 4 },
  6: { stage: "peak", min: 4, max: 5 },
  7: { stage: "wind_down", min: 3, max: 4 },
  8: { stage: "wind_down", min: 2, max: 2 },
};

/** Hard ordering rules enforced by post-validation (doc §硬性规则). */
export const MAX_TEMPO_JUMP_BPM = 15;
export const MAX_ENERGY_JUMP = 1;

/**
 * Single source of truth for the hard-rule prose injected into the Gemini
 * system instruction. Derived from the constants above so a rule change
 * updates both the validator and the prompt automatically.
 */
export function buildHardRulesText(): string {
  return `adjacent tempo difference ≤ ${MAX_TEMPO_JUMP_BPM} BPM; energy step ≤ ${MAX_ENERGY_JUMP} level; no two consecutive tracks share a genre`;
}
