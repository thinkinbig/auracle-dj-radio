# Context Map

## Contexts

- [Live Audio](./CONTEXT.md) — DJ voice, talk-over, skip controls, and listener interruption
- [Catalog](./docs/CONTEXT-catalog.md) — offline music library: artists, albums, tracks, lore, and cover art

## Relationships

- **Catalog → Live Audio**: a **Track** beginning playback triggers a **Cue**, which may reference **Artist** name and **Lore** in the DJ turn; the listener still skips **Tracks**, not **Albums**.
- **Catalog → Flow**: Step 1 retrieval scores **Track** candidates deterministically from SQLite metadata tags (mood envelope, scene, genre, taste); Step 2 planning orders within the mood energy arc. **Album** groups metadata for display, not for arc scheduling.
