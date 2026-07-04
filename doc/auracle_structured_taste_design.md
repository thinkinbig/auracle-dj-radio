# Auracle — Structured Taste Design

> Status: **retired for product personalization** (2026-07-04).
> This document supersedes the 2026-06 plan for an Auracle-owned durable taste profile.

---

## Decision

Auracle will not maintain a durable structured taste profile as a product ranking input.

Retired:

- `/users/me/taste`
- `/taste/weights`
- durable `taste_profile`
- durable `taste_prefs`
- onboarding/editing of Auracle-owned genre/artist/album/track preferences
- mem0 mirroring of taste summaries
- session feedback persistence as `source: "session"`

Still useful:

- catalog taxonomy and stable slugs for internal metadata quality
- deterministic local catalog retrieval
- session-scoped feedback overlay while a station is live
- offline analytics using events

---

## Why Retired

Spotify now owns cross-session taste. Keeping an Auracle structured taste DB would create two long-term taste systems:

1. Spotify top/saved/recent data
2. Auracle genre/artist/album/track preferences

That adds unclear precedence, more UI, more migration work, and more privacy surface. The product direction is to use Spotify as the long-term taste source and keep Auracle focused on live session orchestration.

---

## What Replaces It

At session start:

- `apps/web` reads Spotify top/saved/recent data.
- `apps/web` sends a compact `spotify_taste_summary`.
- Premium users may also send playable Spotify `TrackSeed[]`.
- `agent-harness` stores those inputs only for the current session.
- `music-engine` ranks the local catalog plus optional Spotify seeds.

During a session:

- like/dislike can derive session-scoped preferences
- those preferences may nudge upcoming slots
- nothing is written to a durable taste table

---

## Catalog Metadata

The catalog may still keep:

- `genreSlug`
- `artistSlug`
- `albumSlug`
- `catalogRevision`

These fields are useful for deterministic retrieval, UI display, and future offline analysis. They no longer imply a user taste persistence layer.

---

## Migration Guidance

Implementation should:

1. Remove product callers of `/taste/weights`.
2. Stop persisting session feedback to `TasteStore`.
3. Keep session-scoped taste merge logic in `agent-harness`.
4. Keep catalog slug fields.
5. Mark taste endpoints as compatibility-only before deletion.

---

## Archived Plan

The retired plan included:

- explicit Sound onboarding
- editable user taste profile
- orphan handling on catalog revision
- `taste:migrate`
- mem0 summaries for taste saves
- Condition C loading durable structured preferences

Do not use that plan for new product work.

## Related Docs

- `auracle_memory_decision.md`
- `auracle_personalization_plan.md`
