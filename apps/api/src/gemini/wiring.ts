import { config } from "../config.js";
import { HashEmbedder, type Embedder } from "../flow/embedder.js";
import { HeuristicFlowModel } from "../flow/heuristic-flow.js";
import type { FlowModel } from "../flow/flow-model.js";
import { withEmbedFallback, withFlowFallback } from "./adapters.js";

/**
 * Composition-root wiring for Brain providers. Callers receive interface types
 * (FlowModel, Embedder), not concrete resilient wrappers.
 */
export async function buildFlowModel(): Promise<FlowModel> {
  const fallback = new HeuristicFlowModel();
  if (!config.geminiApiKey) return fallback;

  const { GeminiFlowModel } = await import("../flow/gemini.js");
  return withFlowFallback(new GeminiFlowModel(), fallback);
}

export async function buildEmbedder(): Promise<Embedder> {
  const fallback = new HashEmbedder();
  if (config.embedder !== "gemini" || !config.geminiApiKey) return fallback;

  const { GeminiEmbedder } = await import("../flow/gemini.js");
  return withEmbedFallback(new GeminiEmbedder(), fallback);
}

/** Offline seed: raw embedder, no circuit-breaker (batch job, not runtime). */
export async function buildSeedEmbedder(): Promise<Embedder> {
  if (config.embedder === "gemini" && config.geminiApiKey) {
    const { GeminiEmbedder } = await import("../flow/gemini.js");
    return new GeminiEmbedder();
  }
  return new HashEmbedder();
}
