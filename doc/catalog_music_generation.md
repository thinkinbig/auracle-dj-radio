# Catalog music & cover generation (MiniMax)

> Offline pipeline only. Runtime playback uses pre-generated MP3s + SQLite metadata.

## Why MiniMax (one vendor for audio + art)

- **`music-2.6`** — vocal or instrumental songs from prompt (+ optional lyrics)
- **`image-01`** — album cover backgrounds + artist press portraits
- Same **`MINIMAX_API_KEY`** for `generate-tracks` and `generate-covers`
- Runtime Brain (Live DJ / Flow / mem0) still uses **Gemini** — separate concern

Docs: [MiniMax Music](https://platform.minimax.io/docs/guides/music-generation) · [Image](https://platform.minimax.io/docs/guides/image-generation)

## Pipeline

```text
manifest.json (metadata + lore)
    → generate-covers (MiniMax image-01 + sharp title overlay)
    → generate-tracks (MiniMax music-2.6)
    → catalog-ingest (normalize + QC)
    → export-catalog
    → music-engine seed
```

## CLI

```bash
# Covers / artist photos
pnpm --filter @auracle/catalog generate-covers --all --dry-run
pnpm --filter @auracle/catalog generate-covers --all

# Music
pnpm --filter @auracle/catalog generate-tracks --track t31 --dry-run
pnpm --filter @auracle/catalog generate-tracks --all
```

Requires `MINIMAX_API_KEY` in repo `.env` (see `.env.example`).  
China keys may need `MINIMAX_API_BASE=https://api.minimaxi.com`.

## Regeneration policy

**Do not replace on-disk assets** unless manifest inputs changed.

| Situation | `--all` |
|-----------|---------|
| No file on disk | Generate |
| File exists, manifest unchanged | Skip (prompt-template edits alone do **not** regen t01–t30) |
| Manifest lore/tempo/lyrics/coverSubject changed | Regenerate |
| Intentional redo | `--force` |

Fingerprints: `data/catalog/generation-state.json`

## Prompt design

### Music (`minimax-prompt.ts`)

Compact style string for `music-2.6` (not Lyria narrative blocks):

- Genre, mood, scene, BPM, energy
- Artist Sonic Charter from `lyria-prompt.ts` (`ARTIST_SONIC_CHARTER`)
- Instrumental: `is_instrumental: true`
- Vocal + manifest lyrics: pass `lyrics`
- Vocal without lyrics: `lyrics_optimizer: true`

### Images (`image-prompt.ts`)

- `buildCoverPrompt` → MiniMax `image-01` (no text in image)
- `buildArtistPhotoPrompt` → square portrait
- **sharp** composites album title + artist name on covers

## Models

| CLI | Default model | Override |
|-----|---------------|----------|
| `generate-tracks` | `music-2.6` | `--model music-2.6-free` |
| `generate-covers` | `image-01` | `--model image-01` |

## Post-generation

```bash
pnpm --filter @auracle/catalog catalog-ingest
pnpm --filter @auracle/catalog export-catalog
pnpm --filter @auracle/music-engine seed
pnpm --filter @auracle/catalog catalog-balance-check --goal 100
```

## Related

- Expansion plan: `doc/catalog_expansion_100.md`
- Original Batch 0 prompts: `docs/generated_music_catalog.md`
- Runtime Gemini map: `doc/auracle_gemini_integration.md` (§03 offline note)
