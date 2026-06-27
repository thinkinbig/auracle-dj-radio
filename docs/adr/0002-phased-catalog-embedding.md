# Phased catalog embedding: rich text first, then audio-native

**Date**: 2026-06 (prior)  
**Status**: Superseded  
**Superseded by**: [ADR-0001: Deterministic Structured Music Selection](./0001-deterministic-structured-selection.md)

Catalog retrieval no longer uses cross-modal audio/text embeddings. Track selection is
deterministic structured scoring over SQLite metadata tags (see superseding ADR).

---

## Historical decision (pre-supersession)

Track retrieval embeds the **first 180 seconds** of each mp3 with
`gemini-embedding-2`. Runtime mood/scene queries embed as **text** (with
`task: search result | query: …`) and retrieve against **audio** vectors
(cross-modal).

Phase 1 (rich text via `gemini-embedding-001`) shipped for catalog expansion;
Phase 2 (audio-native) is now the default catalog embed path.

**Album cover** embeddings are deferred (UI-only for now). **mem0** user-preference
vectors stay on `gemini-embedding-001` — catalog and memory indexes are separate
spaces; they need not share a model.

## Considered options

- **Audio-only from day one** — best listen-feel match, but higher build cost,
  harder tests, and blocks catalog expansion on audio API availability.
- **Dual text + audio index with weighted merge** — rejected as premature for
  ~500 tracks; audio-native alone is enough for Phase 2.

## Consequences

- SQLite gains at least one embedding column per phase; switching models requires
  a full re-seed (same as today).
- Phase 2 adds an embed step after MiniMax audio generation; seed script must
  skip or re-embed when mp3 changes.
