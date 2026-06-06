import { describe, expect, it } from "vitest";
import { CircuitBreakerManager, EARLY_FAULT_WINDOW_MS } from "../src/gemini/circuit-breaker.js";

describe("CircuitBreakerManager", () => {
  it("opens after consecutive dial failures and recovers via half-open", () => {
    let now = 1_000_000;
    const m = new CircuitBreakerManager(
      { openAfter: 2, openForMs: 10_000, halfOpenSuccess: 2, authOpenForMs: 60_000 },
      () => now,
    );

    expect(m.allowDial("gemini").allowed).toBe(true);
    m.recordDial("gemini", new Error("timeout"));
    expect(m.allowDial("gemini").allowed).toBe(true);
    m.recordDial("gemini", new Error("timeout"));

    const open = m.allowDial("gemini");
    expect(open.allowed).toBe(false);
    expect(open.state).toBe("open");

    now += 11_000;
    const half = m.allowDial("gemini");
    expect(half.allowed).toBe(true);
    expect(half.state).toBe("half_open");
    expect(m.allowDial("gemini").allowed).toBe(false);

    m.recordDial("gemini", null);
    expect(m.allowDial("gemini").allowed).toBe(true);
    m.recordDial("gemini", null);
    expect(m.allowDial("gemini").allowed).toBe(true);
  });

  it("resets dial failure streak on success", () => {
    let now = 1_500_000;
    const m = new CircuitBreakerManager(
      { openAfter: 2, openForMs: 60_000, halfOpenSuccess: 1, authOpenForMs: 60_000 },
      () => now,
    );

    m.recordDial("gemini", new Error("timeout"));
    m.recordDial("gemini", null);
    now += 2_000;
    m.recordDial("gemini", new Error("timeout"));
    expect(m.allowDial("gemini").allowed).toBe(true);
  });

  it("opens immediately on auth failure", () => {
    const now = 2_000_000;
    const m = new CircuitBreakerManager(
      { openAfter: 5, openForMs: 1_000, halfOpenSuccess: 1, authOpenForMs: 300_000 },
      () => now,
    );

    m.recordDial("gemini", new Error("upstream 401 unauthorized"));
    const d = m.allowDial("gemini");
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("auth");
    expect(d.retryAfterMs).toBeGreaterThan(240_000);
  });

  it("counts early stream faults within the window", () => {
    let now = 4_000_000;
    const start = now;
    const m = new CircuitBreakerManager(
      { openAfter: 3, openForMs: 60_000, halfOpenSuccess: 1, authOpenForMs: 60_000 },
      () => now,
    );

    m.recordStreamFault("gemini", start, true, new Error("timeout"), start + 1_000);
    expect(m.allowDial("gemini").allowed).toBe(true);

    m.recordStreamFault("gemini", start, false, new Error("timeout"), start + 2_000);
    m.recordStreamFault("gemini", start, false, new Error("timeout"), start + 3_000);
    expect(m.allowDial("gemini").allowed).toBe(true);

    m.recordStreamFault("gemini", start, false, new Error("timeout"), start + 4_000);
    expect(m.allowDial("gemini").allowed).toBe(false);

    m.recordStreamFault(
      "gemini",
      start,
      false,
      new Error("timeout"),
      start + EARLY_FAULT_WINDOW_MS + 1_000,
    );
    expect(m.stats().gemini?.stream_failures).toBe(0);
  });
});
