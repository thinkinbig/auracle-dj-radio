import { HeuristicFlowModel } from "./flow/llm/heuristic-flow.js";
import type { FlowModel } from "./flow/llm/flow-model.js";

/** Composition-root wiring for Step 2 flow orchestration (deterministic heuristic only). */
export function buildFlowModel(): FlowModel {
  return new HeuristicFlowModel();
}
