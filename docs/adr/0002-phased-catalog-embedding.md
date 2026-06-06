# Phased catalog embedding: rich text first, then audio-native

Track retrieval currently embeds tag strings only (`mood`, `scene`, `energy`,
`genre`) via `gemini-embedding-001`. The expanded catalog adds **Lore**,
**Artist** persona, and **Album** metadata — plus optional **Album cover**
images and mp3 files suitable for multimodal embedding.

We will embed in two phases:

1. **Rich text** — concatenate artist, album, tags, and lore; embed with
   `gemini-embedding-001` (or text mode of `gemini-embedding-2`). Ship first;
   cheap to rebuild; keeps offline tests workable.
2. **Audio-native** — embed each mp3 with `gemini-embedding-2`; runtime mood/scene
   queries embed as **text** and retrieve against **audio** vectors (cross-modal).

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
