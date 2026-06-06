/** Early stream fault window (mirrors rt_llm_proxy/internal/modelcb.EarlyFaultWindow). */
export const EARLY_FAULT_WINDOW_MS = 10_000;

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  openAfter: number;
  openForMs: number;
  halfOpenSuccess: number;
  authOpenForMs: number;
}

export interface CircuitDecision {
  allowed: boolean;
  state: CircuitState;
  reason?: string;
  retryAfterMs?: number;
}

export interface CircuitStats {
  state: CircuitState;
  reason: string;
  retry_after_sec: number;
  failures: number;
  connect_failures: number;
  stream_failures: number;
  half_open_success: number;
}

/** Classify upstream errors (mirrors rt_llm_proxy/internal/modelcb.classify). */
export function classifyGeminiError(err: unknown): string {
  const s = String(err instanceof Error ? err.message : err).toLowerCase();
  if (
    s.includes("401") ||
    s.includes("403") ||
    s.includes("unauthorized") ||
    s.includes("forbidden")
  ) {
    return "auth";
  }
  if (
    s.includes("timeout") ||
    s.includes("429") ||
    s.includes("502") ||
    s.includes("503") ||
    s.includes("504") ||
    s.includes("connection reset") ||
    s.includes("econnreset") ||
    s.includes("enotfound") ||
    s.includes("fetch failed") ||
    s.includes("network") ||
    s.includes("resource exhausted") ||
    s.includes("overloaded") ||
    s.includes("unavailable")
  ) {
    return "transient";
  }
  return "other";
}

function normalizeConfig(cfg: CircuitBreakerConfig): CircuitBreakerConfig {
  return {
    openAfter: cfg.openAfter > 0 ? cfg.openAfter : 5,
    openForMs: cfg.openForMs > 0 ? cfg.openForMs : 30_000,
    halfOpenSuccess: cfg.halfOpenSuccess > 0 ? cfg.halfOpenSuccess : 3,
    authOpenForMs: cfg.authOpenForMs > 0 ? cfg.authOpenForMs : 300_000,
  };
}

class Breaker {
  private state: CircuitState = "closed";
  private reason = "";
  private openUntilMs = 0;
  private connectFailures = 0;
  private streamFailures = 0;
  private success = 0;
  private halfOpenProbeInFlight = false;

  constructor(private readonly cfg: CircuitBreakerConfig) {}

  allow(nowMs: number): CircuitDecision {
    switch (this.state) {
      case "closed":
        return { allowed: true, state: "closed" };
      case "open":
        if (nowMs < this.openUntilMs) {
          return {
            allowed: false,
            state: "open",
            reason: this.reason,
            retryAfterMs: this.openUntilMs - nowMs,
          };
        }
        this.state = "half_open";
        this.success = 0;
        this.halfOpenProbeInFlight = false;
      // fallthrough
      case "half_open":
        if (this.halfOpenProbeInFlight) {
          return { allowed: false, state: "half_open", reason: this.reason };
        }
        this.halfOpenProbeInFlight = true;
        return { allowed: true, state: "half_open" };
      default:
        return { allowed: true, state: "closed" };
    }
  }

  recordDial(err: unknown | null, nowMs: number): void {
    if (err == null) {
      this.recordSuccess();
      return;
    }
    this.recordDialFailure(classifyGeminiError(err), nowMs);
  }

  recordStreamFault(sessionStartMs: number, producedAudio: boolean, err: unknown, nowMs: number): void {
    if (err == null || producedAudio) return;
    if (nowMs - sessionStartMs >= EARLY_FAULT_WINDOW_MS) return;
    this.recordStreamFailure(nowMs);
  }

  stats(nowMs: number): CircuitStats {
    let retryAfterSec = 0;
    if (this.state === "open" && this.openUntilMs > nowMs) {
      retryAfterSec = Math.ceil((this.openUntilMs - nowMs) / 1000);
    }
    return {
      state: this.state,
      reason: this.reason,
      retry_after_sec: retryAfterSec,
      failures: this.connectFailures + this.streamFailures,
      connect_failures: this.connectFailures,
      stream_failures: this.streamFailures,
      half_open_success: this.success,
    };
  }

  private recordSuccess(): void {
    switch (this.state) {
      case "closed":
        this.connectFailures = 0;
        this.streamFailures = 0;
        break;
      case "half_open":
        this.halfOpenProbeInFlight = false;
        this.success++;
        if (this.success >= this.cfg.halfOpenSuccess) {
          this.state = "closed";
          this.reason = "";
          this.connectFailures = 0;
          this.streamFailures = 0;
          this.success = 0;
        }
        break;
    }
  }

  private recordDialFailure(reason: string, nowMs: number): void {
    let open = false;
    let openForMs = this.cfg.openForMs;
    if (reason === "auth") {
      open = true;
      openForMs = this.cfg.authOpenForMs;
    }

    switch (this.state) {
      case "half_open":
        this.halfOpenProbeInFlight = false;
        open = true;
        break;
      case "closed":
        if (!open) {
          this.connectFailures++;
          if (this.connectFailures >= this.cfg.openAfter) open = true;
        }
        break;
      case "open":
        return;
    }

    if (!open) return;
    this.open(reason, nowMs + openForMs);
  }

  private recordStreamFailure(nowMs: number): void {
    let open = false;
    switch (this.state) {
      case "half_open":
        this.halfOpenProbeInFlight = false;
        open = true;
        break;
      case "closed":
        this.streamFailures++;
        if (this.streamFailures >= this.cfg.openAfter) open = true;
        break;
      case "open":
        return;
    }
    if (!open) return;
    this.open("stream_early", nowMs + this.cfg.openForMs);
  }

  private open(reason: string, untilMs: number): void {
    this.state = "open";
    this.reason = reason;
    this.openUntilMs = untilMs;
    this.connectFailures = 0;
    this.streamFailures = 0;
    this.success = 0;
    this.halfOpenProbeInFlight = false;
  }
}

/**
 * Per-provider circuit breaker manager (port of rt_llm_proxy/internal/modelcb).
 * Auracle uses a single `gemini` provider with fast local fallbacks when open.
 */
export class CircuitBreakerManager {
  private readonly defaults: CircuitBreakerConfig;
  private readonly breakers = new Map<string, Breaker>();
  private now: () => number;

  constructor(defaults: CircuitBreakerConfig, now: () => number = Date.now) {
    this.defaults = normalizeConfig(defaults);
    this.now = now;
  }

  /** Gate a new upstream dial / request. Disabled managers always allow. */
  allowDial(provider: string): CircuitDecision {
    if (!provider || provider === "loopback") {
      return { allowed: true, state: "closed" };
    }
    return this.get(provider).allow(this.now());
  }

  recordDial(provider: string, err: unknown | null): void {
    if (!provider || provider === "loopback") return;
    this.get(provider).recordDial(err, this.now());
  }

  recordStreamFault(
    provider: string,
    sessionStartMs: number,
    producedAudio: boolean,
    err: unknown,
  ): void {
    if (!provider || provider === "loopback" || err == null) return;
    this.get(provider).recordStreamFault(sessionStartMs, producedAudio, err, this.now());
  }

  stats(): Record<string, CircuitStats> {
    const nowMs = this.now();
    const out: Record<string, CircuitStats> = {};
    for (const [provider, breaker] of this.breakers) {
      out[provider] = breaker.stats(nowMs);
    }
    return out;
  }

  private get(provider: string): Breaker {
    let b = this.breakers.get(provider);
    if (!b) {
      b = new Breaker(this.defaults);
      this.breakers.set(provider, b);
    }
    return b;
  }
}
