# Feedback-loop HITL Eval Runbook

> Status: **updated 2026-07-04**.
> Covers current-session feedback only. Long-term `record_preference` evaluation is retired.

---

## Scope

This runbook tests whether the Live DJ chooses the right current-session tool:

- like / dislike / regenerate -> `playlist_feedback`
- mood adjustment -> `mood_change`
- skip -> `skip_track`

It does not test durable preference writes.

---

## Prerequisites

- Full stack running.
- Evaluator records date, commit SHA, model id, condition, account, host mode, Spotify connection state, Premium state, and `session_id`.
- For C runs, Spotify taste must be connected before session creation.

---

## Utterance Sheet

Fresh session per block is recommended to avoid context bleed.

| # | Category | Utterance | Expected tool | Must NOT fire |
|---|----------|-----------|---------------|---------------|
| L1 | like | "I love this song." | `playlist_feedback(like)` | `mood_change`, `skip_track` |
| L2 | like | "This one's great, more like this." | `playlist_feedback(like)` | `skip_track` |
| L3 | like | "This is exactly my vibe right now." | `playlist_feedback(like)` | `mood_change` |
| D1 | dislike | "Not feeling this one." | `playlist_feedback(dislike)` | `skip_track` |
| D2 | dislike | "I don't like this track." | `playlist_feedback(dislike)` | `mood_change` |
| D3 | dislike | "This song isn't doing it for me." | `playlist_feedback(dislike)` | `skip_track` |
| R1 | regenerate | "Start over on what's next." | `playlist_feedback(regenerate)` | `mood_change` only |
| R2 | regenerate | "Shuffle the upcoming queue." | `playlist_feedback(regenerate)` | `skip_track` |
| R3 | regenerate | "Give me a completely new batch." | `playlist_feedback(regenerate)` | `mood_change` only |
| N1 | mood | "I generally want something lighter." | `mood_change` | `playlist_feedback` |
| N2 | mood | "Make it calmer." | `mood_change` | `playlist_feedback` |
| N3 | skip | "Skip." | `skip_track` only | `playlist_feedback`, `mood_change` |

`record_preference` is removed and should never appear.

---

## Acceptance

- like / dislike / regenerate correct-tool rate >= 80%
- false-positive rate on N1-N3 <= 10%
- no `record_preference` calls

Use `scripts/feedback-eval.mjs --session <session_id>` to inspect recorded feedback timelines when available.
