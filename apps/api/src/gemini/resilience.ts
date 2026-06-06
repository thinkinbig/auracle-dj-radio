import { classifyGeminiError } from "./circuit-breaker.js";
import { allowGeminiDial, recordGeminiDial } from "./guard.js";

/**
 * Run a Gemini upstream call with circuit-breaker gating and local fallback.
 * Single control-flow path for plan/embed (rt_llm_proxy modelcb + cascade).
 */
export async function executeWithGeminiFallback<T>(
  surface: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  fallbackLabel: string,
): Promise<T> {
  const gate = allowGeminiDial();
  if (!gate.allowed) {
    console.warn(
      `[gemini-cb] ${surface} circuit ${gate.decision.state} (${gate.decision.reason}), using ${fallbackLabel}`,
    );
    return fallback();
  }

  try {
    const result = await primary();
    recordGeminiDial(null);
    return result;
  } catch (err) {
    recordGeminiDial(err);
    console.warn(
      `[gemini-cb] ${surface} failed (${classifyGeminiError(err)}), using ${fallbackLabel}:`,
      err instanceof Error ? err.message : err,
    );
    return fallback();
  }
}

/** Record upstream faults from opaque callers (e.g. mem0) when they look Gemini-related. */
export function recordOpaqueGeminiFault(err: unknown): void {
  const kind = classifyGeminiError(err);
  if (kind === "transient" || kind === "auth") recordGeminiDial(err);
}
