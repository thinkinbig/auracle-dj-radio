import type { FlowResult, SessionIntent, TrackCandidate } from "@auracle/shared";
import { FULL_SESSION_LENGTH } from "@auracle/shared";
import type { TrackRow } from "../db/index.js";
import type { Embedder } from "./embedder.js";
import type { FlowModel, FlowInput } from "./flow-model.js";
import { retrieveCandidates } from "./retrieve.js";
import { validateTracklist, type Violation } from "./validate.js";

export interface PlanDeps {
  embedder: Embedder;
  flowModel: FlowModel;
  /** Returns the full track library (read from SQLite at call time). */
  tracks: () => TrackRow[];
}

export interface PlanResult {
  result: FlowResult;
  violations: Violation[];
  candidatesById: Map<string, TrackCandidate>;
}

/** Initial session plan: Step 1 retrieval → Step 2 Flow over a fresh 8-track arc. */
export async function createPlan(deps: PlanDeps, intent: SessionIntent): Promise<PlanResult> {
  const candidates = await retrieveCandidates(deps.embedder, deps.tracks(), {
    mood: intent.mood,
    scene: intent.scene,
    limit: 24,
  });
  return runFlow(deps.flowModel, {
    intent,
    memories: "",
    played: [],
    lastPlayedEnergy: null,
    remainingSlots: FULL_SESSION_LENGTH,
    candidates,
  });
}

export interface ReplanInput {
  intent: SessionIntent;
  playedIds: string[];
  played: TrackCandidate[];
  lastPlayedEnergy: number | null;
  remainingSlots: number;
}

/** Mid-session replan: re-fill only the remaining slots, excluding played tracks. */
export async function replan(deps: PlanDeps, input: ReplanInput): Promise<PlanResult> {
  const candidates = await retrieveCandidates(deps.embedder, deps.tracks(), {
    mood: input.intent.mood,
    scene: input.intent.scene,
    excludeIds: new Set(input.playedIds),
    limit: Math.max(24, input.remainingSlots * 3),
  });
  return runFlow(deps.flowModel, {
    intent: input.intent,
    memories: "",
    played: input.played,
    lastPlayedEnergy: input.lastPlayedEnergy,
    remainingSlots: input.remainingSlots,
    candidates,
  });
}

/** Run the Flow model, validating once and retrying a single time on violations. */
async function runFlow(flowModel: FlowModel, input: FlowInput): Promise<PlanResult> {
  const candidatesById = new Map(input.candidates.map((c) => [c.id, c]));
  let result = await flowModel.plan(input);
  let violations = validateTracklist(result.tracklist, candidatesById);
  if (violations.length > 0) {
    result = await flowModel.plan(input);
    violations = validateTracklist(result.tracklist, candidatesById);
  }
  return { result, violations, candidatesById };
}
