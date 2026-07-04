# Auracle — Flow & Live DJ Design

> Status: **updated 2026-07-04** for Spotify taste and session-only adaptation.

---

## Core Design

Auracle keeps the live radio session. Spotify provides cross-session taste.

Flow has two jobs:

1. Build a coherent queue from mood / scene / catalog / optional Spotify seeds.
2. Replan the current session when the listener asks for changes.

Flow does not read mem0, durable structured taste, or cross-session skip weights.

---

## Step 1 — Retrieval

Inputs:

- mood
- scene
- current session exclusions
- optional `personalizationContext` from Spotify taste summary
- optional Spotify `TrackSeed[]` for Premium users
- optional session-scoped feedback overlay

The live scorer remains deterministic and metadata-based. The catalog path does not require Gemini, Qdrant, or runtime embeddings.

---

## Step 2 — Ordering

`music-engine` orders candidates against the mood energy arc using deterministic rules.

The planner may mix:

- local catalog tracks
- Spotify seeds sent by the browser for this session

Spotify seeds are session inputs, not durable stored taste.

---

## Live DJ

Gemini Live hosts the session and calls tools. It does not store taste.

Tool set:

- `skip_track`
- `mood_change`
- `change_host_mode`
- `pause_playback`
- `playlist_feedback`

Removed:

- `record_preference`

---

## Condition Differences

| Condition | Spotify taste | Spotify seeds | Replan / feedback |
|-----------|---------------|---------------|-------------------|
| A | No | No | No queue mutation after start |
| B | No | No | Yes, current session only |
| C | Required | Optional, Premium only | Yes, current session only |

---

## Context Naming

Use `personalizationContext` for session-start context.

During migration, `mem0Context` may exist in code as a legacy name, but it must no longer mean mem0 recall.

---

## Related Docs

- `auracle_personalization_plan.md`
- `auracle_api_protocol.md`
- `docs/adr/0005-mixed-local-spotify-queue.md`
