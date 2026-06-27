import { config } from "./config.js";
import { HashEmbedder, type Embedder } from "./flow/llm/embedder.js";
import { HeuristicFlowModel } from "./flow/llm/heuristic-flow.js";
import type { FlowModel } from "./flow/llm/flow-model.js";
import { GeminiEmbedder, GeminiFlowModel } from "./flow/llm/gemini.js";
import { withEmbedFallback, withFlowFallback } from "./flow/llm/fallback.js";

/**
 * Composition-root wiring for music intelligence providers. Callers receive
 * interface types (FlowModel, Embedder); the Gemini path is wrapped with an
 * offline fallback at the seam. No circuit breaker — that lives in rt_llm_proxy
 * for the live dial path (refactor-three-services 2b).
 */
export function buildFlowModel(): FlowModel {
  const fallback = new HeuristicFlowModel();
  if (!config.geminiApiKey) return fallback;
  return withFlowFallback(new GeminiFlowModel(), fallback);
}

export function buildEmbedder(): Embedder {
  const fallback = new HashEmbedder();
  // Gemini and hash live in different vector spaces — runtime must match seed.
  // config.embedder picks gemini when GEMINI_API_KEY is set (see config.ts).
  if (config.embedder !== "gemini" || !config.geminiApiKey) return fallback;
  return withEmbedFallback(new GeminiEmbedder(), fallback);
}

/** Offline seed: raw embedder, no fallback wrapper (batch job, not runtime). */
export function buildSeedEmbedder(): Embedder {
  if (config.embedder === "gemini" && config.geminiApiKey) return new GeminiEmbedder();
  return new HashEmbedder();
}
