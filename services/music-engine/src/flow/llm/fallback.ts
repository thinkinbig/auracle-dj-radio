import type { FlowModel } from "./flow-model.js";

/**
 * Resilience seam for music-engine's Gemini flow calls: try the provider, fall back
 * to the offline model on any error. No circuit breaker by design — the live
 * media-dial path owns circuit breaking in rt_llm_proxy (Go modelcb); flow here
 * is a batch-ish REST call whose offline fallback (heuristic) IS the resilience
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
