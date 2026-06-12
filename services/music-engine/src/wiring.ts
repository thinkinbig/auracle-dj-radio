import { config } from "./config.js";
import { HashEmbedder, type Embedder } from "./flow/embedder.js";
import { HeuristicFlowModel } from "./flow/heuristic-flow.js";
import type { FlowModel } from "./flow/flow-model.js";

/**
 * Composition-root wiring for music intelligence providers.
 *
 * Phase 1 ships the OFFLINE stack only (HashEmbedder + HeuristicFlowModel) — no
 * Gemini dependency, fully unit-testable without a key. The Gemini-backed Flow
 * model + embedder and their circuit-breaker/resilience tail are shared Brain
 * infra; they land in Phase 2 as a shared package once memory-service needs them
 * too (refactor-three-services follow-up), wired in here behind the same
 * interface return types.
 */
export function buildFlowModel(): FlowModel {
  return new HeuristicFlowModel();
}

export function buildEmbedder(): Embedder {
  if (config.embedder === "gemini") {
    console.warn("[music-engine] AURACLE_EMBEDDER=gemini but the Gemini stack lands in Phase 2; using HashEmbedder.");
  }
  return new HashEmbedder();
}
