# Catalog manifest with staged offline CLI

The expanded catalog (artists, albums, tracks, lore, covers, mp3s) is authored
as **`data/catalog/manifest.json`** — the single source of truth for metadata.
Offline generation is split into separate CLI steps rather than one monolithic
build, matching the existing `generate-tracks` pattern (`--track`, `--all`,
`--dry-run`, `--force`).

Steps: `catalog:compose` (Gemini → manifest) → `catalog:covers` (image gen) →
`generate-tracks` (MiniMax) → `seed` (text embed) → `catalog:embed-audio`
(Phase 2). Each step reads or updates the manifest and can be re-run
independently when one stage fails or assets change.

## Considered options

- **Monolithic `catalog:build`** — simpler invocation, but brittle when audio or
  cover APIs fail mid-run.
- **Hand-written manifest only** — fine for a one-off spike, not sustainable as
  the library grows.

## Consequences

- `SEED_TRACKS` in TypeScript gives way to (or is generated from) the manifest.
- SQLite schema grows (`artists`, `albums` tables or denormalized columns on
  `tracks`); seed reads manifest + on-disk assets.
