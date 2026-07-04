# Auracle — API & Live Protocol

> Status: **updated 2026-07-04** for Spotify-owned cross-session taste and Auracle-owned live sessions.

---

## Runtime Services

```text
apps/web
  REST /sessions*        -> agent-harness
  WebRTC / Live media    -> rt_llm_proxy
  Spotify OAuth token    stays in browser

agent-harness
  live session lifecycle
  queue / playhead / replan / feedback
  DJ registration for proxy
  calls music-engine for planning
  records events through memory-service

music-engine
  deterministic catalog + seed ranking
  provisional / full / replan / extend plans

memory-service (name pending)
  auth
  session_events
  eval / analytics queries
  legacy memory endpoints during migration only
```

`memory-service` is no longer the owner of product memory. See `auracle_memory_decision.md`.

---

## `POST /sessions`

Creates a live radio session.

Request:

```json
{
  "mood": "calm",
  "scene": "study",
  "duration_min": 25,
  "condition": "C",
  "spotify_taste_summary": "Spotify-derived Auracle taste summary: ...",
  "seeds": [
    {
      "uri": "spotify:track:...",
      "title": "...",
      "artist": "...",
      "albumTitle": "...",
      "albumCoverUrl": "...",
      "durationSec": 210
    }
  ]
}
```

Condition rules:

- **A**: ignore `spotify_taste_summary` and `seeds`; queue is fixed after creation.
- **B**: ignore `spotify_taste_summary` and `seeds`; session replan/feedback is enabled.
- **C**: require non-empty `spotify_taste_summary`; optional `seeds` only when Spotify Premium playback is available.

If `condition: "C"` has no Spotify taste summary, return `400` instead of silently degrading.

Response should use `personalization_context` as the forward-looking field name. During migration, `mem0_context` may remain as a compatibility alias but must mean the same session-start personalization context, not mem0 recall.

```json
{
  "session_id": "uuid",
  "session_title": "...",
  "session_subtitle": "...",
  "host_mode": "curator",
  "current_track_index": 0,
  "tracklist": [],
  "personalization_context": "Spotify-derived Auracle taste summary: ...",
  "proxy_url": "http://localhost:8090",
  "token": "uuid"
}
```

---

## Session REST

| Method | Path | Meaning |
|--------|------|---------|
| `POST` | `/sessions` | Create a session. |
| `GET` | `/sessions/:id` | Current snapshot. |
| `GET` | `/sessions/:id/registration` | DJ registration payload for proxy. |
| `POST` | `/sessions/:id/tool` | Live DJ function call forwarded by proxy. |
| `POST` | `/sessions/:id/now_playing` | Browser playhead mirror. |
| `POST` | `/sessions/:id/cue` | End-of-track or break cue. |
| `POST` | `/sessions/:id/host-mode` | Change host speaking mode. |
| `POST` | `/sessions/:id/playlist-feedback` | `like`, `dislike`, or `regenerate`. |
| `POST` | `/sessions/:id/extend` | Rolling queue extension retry. |
| `POST` | `/sessions/:id/events` | Client telemetry. |

---

## Playlist Feedback

```json
{ "feedback": "like" }
```

Allowed values:

- `like`
- `dislike`
- `regenerate`

Behavior:

- A records telemetry but leaves the queue fixed.
- B/C apply session-scoped feedback to the current session.
- Like/dislike may nudge the next 1-2 upcoming tracks.
- Regenerate rebuilds the upcoming queue.
- Feedback is **not** persisted as cross-session taste.
- Feedback does **not** write mem0.

---

## Live DJ Tools

The setup tool declarations should include:

- `skip_track`
- `mood_change`
- `change_host_mode`
- `pause_playback`
- `playlist_feedback`

Removed:

- `record_preference`

`record_preference` must not be reintroduced as a product tool because long-term taste is owned by Spotify.

---

## Events

Events remain first-class because they support eval, debugging, and analytics.

Required product/eval events include:

- `session_created`
- `track_started`
- `playlist_feedback`
- `playlist_regenerate_requested`
- `replan`
- `replan_failed`
- `skip_latency`
- `pause_playback`
- `change_host_mode`

Events are not a product recommender input across sessions.

---

## Spotify Token Boundary

The Spotify OAuth token stays in `apps/web`.

The server receives only:

- derived summary text
- session-scoped seed tracks
- normal session events

The server does not store raw Spotify top/recent/saved history.

---

## Related Docs

- `auracle_personalization_plan.md`
- `auracle_memory_decision.md`
- `docs/adr/0005-mixed-local-spotify-queue.md`
