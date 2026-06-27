# ADR-0001: Deterministic Structured Music Selection Pipeline

**Date**: 2026-06-27  
**Status**: Accepted  
**Deciders**: Zeyuli  
**Affected Components**: music-engine (retrieval, flow, weighting), shared (catalog types), web (UI tone/mode)

## Context

The current music selection pipeline has two quality issues:

1. **Mood→Energy mismatch**: User selects `calm` mood but gets high-energy (5) tracks. Root cause: Energy arc (`energyTargets`) is mood-blind—it always climbs to peak(5-6) regardless of mood.
2. **Cross-modal embedding noise**: Query (text: `"mood: X | scene: Y"`) matched against track embeddings (Gemini **audio**: 180s audio clip). Cross-modal cosine similarity is unreliable. With 30 clean-tagged tracks, that path adds noise, not signal. **Same-modality text embedding** (tag string vs query string via `gemini-embedding-001`) remains a valid future option — see Notes.
3. **Unstable generation quality**: Gemini flow model non-determinism compounds the above. Energy-arc ordering depends on LLM respecting prompt constraints, which sometimes fail.

## Decision

Redesign the selection pipeline from **three independent channels** (embedding + energy arc + taste) to a **single deterministic scorer** where energy is the canonical taxis:

| Dimension | Before | After |
|---|---|---|
| **Energy source** | Arc-blind (always peak 5-6) | mood → energy envelope (direct + soft Gaussian) |
| **Retrieval** | Cross-modal **audio** embedding cosine | Structured scoring (MVP); optional future **text** embedding layer |
| **Ordering** | Gemini LLM (non-deterministic) | Deterministic arc (amplitude = f(mood)) |
| **Schema** | Qdrant vectors | SQLite (no new DB) |

### 1. Mood ↦ Energy (Direct Static Mapping)

Create a closed-form mood-to-energy mapping (7 moods is a finite set):

```typescript
const MOOD_ENERGY_CENTER = {
  calm: 1,
  mellow: 2,
  warm: 2.5,
  focused: 3,
  uplifting: 3.5,
  energetic: 4,
  euphoric: 5,
};
```

Energy envelope around each center is a **soft Gaussian penalty** (not a hard band):
```
penalty(energy, center) = k * (energy - center)²
```

Where `k` is a tuning knob:
- `k` large → strict (calm almost never strays above 2)
- `k` small → loose (calm can accept energy-3 if catalog exhausted)

This prevents starvation (30-track catalog) while guaranteeing low-mood sessions don't randomly get peak energy.

### 2. Retrieval: Structured Scoring (MVP; Replaces Cross-Modal Audio Embedding)

**Current (MVP)**: deterministic structured scorer — no runtime embed API on the catalog path.

```typescript
score(track, intent, taste, mem0) = 
  - k * (track.energy - MOOD_ENERGY_CENTER[intent.mood])²  // energy penalty
  + W_scene  * sceneFit(track.scene, intent.scene)          // 0 or 1
  + W_genre  * genreFit(track.genre, tasteGenres)           // 0 or 1  
  + TASTE_WEIGHT * tasteRerank(track, taste)                // semantic: genre/artist/album/track (only within energy envelope)
  - SKIP_PENALTY * mem0EnergySkip(track.energy, mem0)       // energy preference (tie-break only)
```

All terms are deterministic integers or bounded floats. No cross-modal audio embedding, no catalog Qdrant.

**Future option (not MVP)**: **text-to-text** retrieval — offline `embedContent` on each track's tag string (e.g. `"mood: calm scene: study energy: 2 genre: lo-fi"`), runtime embed on the query, cosine Top-K **within the mood energy envelope**. Same model as mem0 (`gemini-embedding-001`, native 3072). Can hybrid with structured scoring (hard filter + embed rerank).

### 3. Ordering: Arc Amplitude = f(mood)

Currently, `energyTargets` generates a full arc warm-up(1-2) → build(3-4) → peak(5-6) → wind-down(2) regardless of mood. Replace with:

```typescript
function arcAmplitude(mood: string, k = 2): { min: number; max: number } {
  const center = MOOD_ENERGY_CENTER[mood];
  const tolerance = 0.5 + 1 / Math.max(k, 0.01); // tolerance grows as k shrinks
  return { min: Math.max(1, center - tolerance), max: Math.min(5, center + tolerance) };
}
```

- calm → [1, 2] with default k=2 (nearly flat after clamping)
- euphoric → [4, 5] with default k=2 (allows 5)
- Smooth glide on replan targets the arc amplitude's floor, not unconditional energy 2.

### 4. Taste Reranking: Priority Order

**Invariant**: mood energy envelope > taste reranking > mem0 skip penalty.

- **Structural taste** (genre/artist/album/track prefer/avoid): Additive rerank, only among tracks within energy envelope. Does not break envelope.
- **mem0 energy preference** ("I like high energy"): Only tie-breaker / micro-adjustment within envelope. Never pulls a calm-session track up to euphoric energy.

`track.mood` field: demoted to display-only. Only `track.energy` enters scoring.

### 5. Gemini: From Selection to Copywriting (Async)

Remove Gemini from ordering (Step 2). Keep it for:
- **session_title** / **session_subtitle** / **per-track reason** (copywriting).
- **Async, non-blocking**: First track plays immediately; title/reason arrive later (or use static templates as fallback).

Eliminates 5–20s first-start latency (currently bottleneck per perf-first-start memory).

### 6. Validation → Assertion Only

Deterministic scorer respects constraints by construction:
- Energy always within envelope.
- Adjacent tracks respect `adjacentStepPenalty` (built into selection, not post-validated).

Validation becomes **unit-test assertions** and **safety-net checks** (not repair loops). Delete `repair.ts` LLM retry.

## Consequences

### ✓ Wins
- **Quality guaranteed**: Quality ∝ algorithm correctness, not LLM randomness. "calm → energy < 3" is a testable invariant.
- **No starvation**: Soft Gaussian prevents catalog underflow; can expand catalog safely.
- **Fast**: Retrieval is ~O(catalog) scoring + sort; no embedding calls, no Qdrant latency on the **catalog path**.
- **Simpler catalog ops**: music-engine no longer depends on Qdrant or embed APIs. **mem0** (memory-service) still uses Qdrant + `gemini-embedding-001` for cross-session user memory — unchanged.
- **Cacheable**: Deterministic ordering + fixed session intent = deterministic tracklist. Cache invalidation is trivial (taste or memories changed? → cache miss).

### ⚠ Tradeoffs
- **Loss of semantic audio matching**: Gemini **audio** embedding was "heard the song" signal. MVP relies on structural metadata tags. **Text embedding** on tags can restore semantic matching without cross-modal noise — deferred post-MVP.
- **No LLM ordering "taste"**: Gemini LLM could (in theory) find subtle genre/mood combos. Now it's rules-based. Mitigation: Taste preference + weights are the new "knob."
- **Tight coupling to mood taxonomy**: 7 moods is the inventory. Adding/changing moods requires code. Mitigation: Small enumerated set is fine for MVP; can table for future.

## Implementation Plan

1. **Define mood→energy table** in `packages/shared/src/mood.ts` (7 values, static).
2. **Rewrite `retrieveCandidates`**: Delete embedding calls; add structured scorer.
3. **Rewrite `energyTargets`**: `arc = f(mood)` instead of unconditional full arc.
4. **Rewrite `chooseNext`**: Track `adjacentStepPenalty` during selection, not post-validate.
5. **Async Gemini copywriting**: Move title/reason generation outside critical path.
6. **Delete** (cross-modal / audio catalog embed path only):
   - `GeminiEmbedder`, `HashEmbedder`, `embedder.ts`, `audio-clip.ts`, `fallback.ts` embedding fallback.
   - Catalog-side Qdrant wiring (mem0 Qdrant in memory-service **stays**).
   - `repair.ts` (validation loop).
   - `track.embedding` SQLite column (re-add later if/when text embed index ships).
7. **Update tests and callers**: Use `selectMoodEnergySequence` directly in structured scorer tests and call sites.
8. **Mark ADR-0002 (phased catalog embedding) as Superseded**.

## Notes

- **Catalog expansion**: Structured scoring scales to thousands of tracks (no embedding bottleneck). Refine weights and tolerance bands (`k`) as catalog grows.
- **Future: text embedding (same modality)**: Re-introduce `gemini-embedding-001` for catalog **text** vectors only — tag string at seed time, query string at runtime, cosine rerank inside the energy envelope. Shares embed model with mem0; catalog index can stay in SQLite (`embedding_json`) without a second Qdrant. Supersedes cross-modal audio embed (ADR-0002 Phase 2), not ADR-0002 Phase 1 text path.
- **Future: Rich tagging**: Instrument tags / mood-color / production-year → structured scoring and/or richer text embed strings.
- **Taste weighting**: See `taste-weighting.ts` already in codebase; this ADR clarifies its role (semantic only, within energy envelope).
