import { config } from "../config.js";
import { CircuitBreakerManager } from "./circuit-breaker.js";

export const GEMINI_PROVIDER = "gemini";

/** Process-wide Gemini circuit breaker (rt_llm_proxy modelcb pattern). */
export const geminiCircuit: CircuitBreakerManager | null = config.geminiCbEnable
  ? new CircuitBreakerManager({
      openAfter: config.geminiCbOpenAfter,
      openForMs: config.geminiCbOpenForMs,
      halfOpenSuccess: config.geminiCbHalfOpenSuccess,
      authOpenForMs: config.geminiCbAuthOpenForMs,
    })
  : null;

export function allowGeminiDial(): { allowed: true } | { allowed: false; decision: ReturnType<CircuitBreakerManager["allowDial"]> } {
  if (!geminiCircuit) return { allowed: true };
  const decision = geminiCircuit.allowDial(GEMINI_PROVIDER);
  if (decision.allowed) return { allowed: true };
  return { allowed: false, decision };
}

export function recordGeminiDial(err: unknown | null): void {
  geminiCircuit?.recordDial(GEMINI_PROVIDER, err);
}

export function recordGeminiStreamFault(sessionStartMs: number, producedAudio: boolean, err: unknown): void {
  geminiCircuit?.recordStreamFault(GEMINI_PROVIDER, sessionStartMs, producedAudio, err);
}

export function geminiCircuitStats(): Record<string, import("./circuit-breaker.js").CircuitStats> | null {
  return geminiCircuit?.stats() ?? null;
}
