import { config } from "./config.js";
import { HeuristicFlowModel } from "./flow/llm/heuristic-flow.js";
import type { FlowModel } from "./flow/llm/flow-model.js";
import { GeminiFlowModel } from "./flow/llm/gemini.js";
import { withFlowFallback } from "./flow/llm/fallback.js";

/**
 * Composition-root wiring for music intelligence providers. Callers receive
 * interface types (FlowModel); the Gemini path is wrapped with an offline
 * fallback at the seam. No circuit breaker — that lives in rt_llm_proxy
 * for the live dial path (refactor-three-services 2b).
 */
export function buildFlowModel(): FlowModel {
  const fallback = new HeuristicFlowModel();
  if (!config.geminiApiKey) return fallback;
  return withFlowFallback(new GeminiFlowModel(), fallback);
}
