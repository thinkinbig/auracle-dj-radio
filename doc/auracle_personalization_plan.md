# Auracle — Personalization Plan

> Status: **updated 2026-07-04** after the Spotify taste boundary decision.
> Supersedes the 2026-06 mem0 / structured taste / cross-session skip plan.

---

## 1. Product Boundary

Auracle personalization now has two layers:

| Layer | Owner | Scope |
|-------|-------|-------|
| Cross-session taste | Spotify | Long-term taste signals derived from the user's Spotify account. |
| Live adaptation | Auracle | Current session queue, replan, like/dislike, regenerate, mood changes, events. |

Auracle does **not** maintain a second long-term taste profile.

Retired product paths:

- mem0 / Qdrant user memory
- durable structured taste profile
- `record_preference`
- cross-session `skipRateByEnergy` ranking
- session feedback persistence into taste rows

Still retained:

- `SessionStore` and live session orchestration
- `session_events` for eval / analytics
- in-session `sessionTaste` overlay for immediate queue nudges
- Spotify taste summary and Spotify track seeds as session inputs

---

## 2. Spotify Boundary

The browser owns Spotify access because the OAuth token stays client-side.

At session start the browser can send:

- `spotify_taste_summary`: compact derived summary from top artists/tracks, saved tracks, and recently played tracks.
- `seeds: TrackSeed[]`: playable Spotify library candidates, only when playback is enabled and Premium is available.

Do not persist raw Spotify taste data server-side.

Premium rule:

- Spotify signed in, non-Premium: C can use `spotify_taste_summary` and local catalog playback.
- Spotify signed in, Premium: C can use `spotify_taste_summary` plus Spotify seeds for a mixed queue.
- Spotify signed out: C is unavailable.

---

## 3. A/B/C Conditions

| Condition | Definition | Spotify taste | Spotify seeds | In-session replan / feedback |
|-----------|------------|---------------|---------------|------------------------------|
| **A** | Fixed baseline | No | No | No replan; skip/pause only |
| **B** | Session-adaptive | No | No | Yes |
| **C** | Spotify-personalized + session-adaptive | Required | Optional, Premium only | Yes |

Rules:

- A/B ignore `spotify_taste_summary` and `seeds` even if the browser sends them.
- C must have a non-empty Spotify taste summary. Missing summary is a hard error, not a silent downgrade.
- C does not require Spotify Premium.
- C's personalization comes from Spotify taste, not mem0 or Auracle-owned durable taste.

---

## 4. Runtime Data Flow

```text
apps/web
  read Spotify top/saved/recent
  build spotify_taste_summary
  gather playable seeds if Premium
        |
        v
POST /sessions
        |
        v
agent-harness
  validate condition
  store live SessionState
  cache seeds for this session
  pass personalizationContext + seeds to music-engine
        |
        v
music-engine
  rank local catalog + optional Spotify seeds
  apply mood/scene/energy rules
  apply session-scoped feedback overlay only
```

Events continue to flow into `session_events`, but events are not fed back into future-session product ranking.

---

## 5. Live Tools

Keep:

- `skip_track`
- `mood_change`
- `change_host_mode`
- `pause_playback`
- `playlist_feedback` (`like`, `dislike`, `regenerate`)

Remove:

- `record_preference`

Reason: `record_preference` means "save this for future sessions." That conflicts with the decision that Spotify owns long-term taste.

---

## 6. Service Responsibilities

### `agent-harness`

- owns live session state
- validates condition behavior
- caches session seeds
- handles replan / regenerate / nudge
- passes `personalizationContext` to prompts/planning

### `music-engine`

- deterministic ranking and flow planning
- local catalog retrieval
- mixed local/Spotify seed ranking
- no durable user memory

### current `profile-service`

Short-term retained for:

- auth
- events
- eval queries

Target direction:

- rename or split later into `profile-service` / `events-service`
- remove mem0/Qdrant product dependency first

---

## 7. Migration Plan

1. Rename product semantics from `mem0Context` to `personalizationContext`. Done.
2. Stop product calls to `recallForIntent()`, `remember()`, `tasteWeights()`, and `skipRateByEnergy()`. Done.
3. Remove `record_preference` from tool declarations, prompts, tool runner, tests, and docs. Done.
4. Keep `playlist_feedback` session nudge, but stop durable persistence. Done.
5. Make C require Spotify taste summary. Done.
6. Ensure A/B ignore Spotify summary and seeds. Done.
7. Keep `/events` and `/events/query` for evaluation. Done.
8. Remove `/memory/*`, `/taste/weights`, `/users/me/taste`, Qdrant, and the mem0 effectiveness smoke path. Done.

---

## 8. Evaluation Checklist

Before a run:

- Spotify connected for every C session.
- C session has `spotify_taste_summary`.
- A/B sessions have no Spotify personalization inputs applied.
- Premium status recorded because it affects mixed queue availability.
- `session_created` records condition, intent, tracklist, and whether Spotify summary/seeds were provided.

Expected behavior:

- A: fixed queue after start.
- B: replan and feedback affect only current session.
- C: Spotify taste affects start/refine planning; replan and feedback affect current session.

Failure handling:

- C without Spotify taste: fail fast and redo after login.
- Spotify API read failure: do not create C; mark setup failure.
- Spotify Premium absent: create C with local catalog only.
- Replan failure: mark `replan_failed`; session can continue.

---

## 9. Related Docs

- `auracle_memory_decision.md`
- `auracle_evaluation_design.md`
- `auracle_api_protocol.md`
- `docs/adr/0005-mixed-local-spotify-queue.md`
