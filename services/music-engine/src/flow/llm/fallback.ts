import type { FlowModel } from "./flow-model.js";
import type { Embedder } from "./embedder.js";

/**
 * Resilience seam for music-engine's Gemini calls: try the provider, fall back
 * to the offline model on any error. No circuit breaker by design — the live
 * media-dial path owns circuit breaking in rt_llm_proxy (Go modelcb); flow/embed
 * here are batch-ish REST calls whose offline fallback (heuristic / hash) IS the
 * resilience (refactor-three-services 2b). Worst case on a Gemini outage is one
 * timeout per call before degrading, acceptable for these surfaces.
 */
async function withFallback<T>(label: string, primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch (err) {
    console.warn(
      `[music-engine] Gemini ${label} failed, using offline fallback:`,
      err instanceof Error ? err.message : err,
    );
    return fallback();
  }
}

/** FlowModel adapter: Gemini primary with heuristic fallback at the seam. */
export function withFlowFallback(primary: FlowModel, fallback: FlowModel): FlowModel {
  return { plan: (input) => withFallback("flow", () => primary.plan(input), () => fallback.plan(input)) };
}

/** Embedder adapter: Gemini primary with hash fallback at the seam. */
export function withEmbedFallback(primary: Embedder, fallback: Embedder): Embedder {
  return {
    embedTrack: (t) => withFallback("embed", () => primary.embedTrack(t), () => fallback.embedTrack(t)),
    embedQuery: (mood, scene) =>
      withFallback("embed", () => primary.embedQuery(mood, scene), () => fallback.embedQuery(mood, scene)),
  };
}
