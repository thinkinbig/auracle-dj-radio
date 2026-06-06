---
name: perf-first-start
description: First-Start latency is the Gemini flow LLM call (5–20s), not the data layer; Redis won't help
metadata:
  type: project
---

First-Start "卡" on Auracle is dominated by `POST /sessions` → `createPlan` → Gemini flow model (`gemini-3.1-flash-lite`) `generateContent`. Measured 2026-06-06: 5.6–22.8s, high variance, = upstream Gemini latency. Track metadata (SQLite `GET /tracks/:id`) is 0.00s.

**Why:** Redis/caching the data layer is pointless — data is already instant; the slow path is an external LLM call Redis can't accelerate. `thinkingConfig: { thinkingBudget: 0 }` on the flow call helped marginally (best ~5.6s) but variance persists → it's upstream, not thinking.

**How to apply:** To improve first-Start, mask the wait (optimistic UI — done: `'curating'` phase in [[project_auracle]], "Tuning in…" + animated waveform, Start no longer blocks on prefetch). For repeat-Start speed, an in-process `Map` plan cache keyed on (mood,scene,condition,mem0-hash) — NOT Redis (single instance; cache must include mem0 hash or it breaks Condition C eval fidelity). Prefetch the NEXT mp3 to smooth transitions (doesn't help first Start). Gemini 503s (flow model overload) are handled by a circuit breaker (`/health` exposes `gemini_cb`). mem0 needs Qdrant on :6333 or it degrades (`mem0_available:false`).
