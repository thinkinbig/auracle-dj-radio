# Feedback-loop HITL eval runbook (#66–#69)

> Companion to `auracle_evaluation_design.md`. This runbook covers the **voice
> feedback loop only** (like / dislike / regenerate via the Live DJ
> `playlist_feedback` tool — UI buttons are removed). Everything except the
> speaking is scripted: capture is `session_events`, scoring is
> `scripts/feedback-eval.mjs`.

## Prerequisites

- Full stack running (`pnpm dev` — see `scripts/dev-stack.sh`), `GEMINI_API_KEY` set.
- Web built/served with `VITE_EVAL_MODE=true`; evaluator logged in with a
  **pre-registered eval account** (never guest / `auracle_anonymous`).
- Condition injected at session create (B or C; A only for noop controls).
- Record per run: date, commit SHA, Gemini model id, condition, account email,
  `host_mode`, and the `session_id` (visible in the network tab on `POST /sessions`).

## Utterance sheet (#67)

Rules: **fresh session per 3-utterance block** (avoid context bleed). Hold the
talk button (or VAD) **mid-track** for like/dislike; regenerate may be spoken
between tracks. Score a line **pass** when the expected tool fires within
**5s of utterance end** and no must-NOT tool fires; score tool calls, not queue
latency (regenerate is async by design).

| # | Category | Utterance | Expected tool | Must NOT fire |
|---|----------|-----------|---------------|---------------|
| L1 | like | "I love this song." | `playlist_feedback(like)` | `record_preference` alone; `mood_change` |
| L2 | like | "This one's great — more like this." | `playlist_feedback(like)` | `skip_track` |
| L3 | like | "Oh this is exactly my vibe right now." | `playlist_feedback(like)` | `mood_change` |
| D1 | dislike | "Not feeling this one." | `playlist_feedback(dislike)` | `skip_track` (user didn't say skip) |
| D2 | dislike | "I don't like this track." | `playlist_feedback(dislike)` | `skip_track`, `mood_change` |
| D3 | dislike | "This song isn't doing it for me." | `playlist_feedback(dislike)` | `record_preference` alone |
| R1 | regenerate | "Start over on what's next." | `playlist_feedback(regenerate)` | `mood_change` only |
| R2 | regenerate | "Shuffle the upcoming queue." | `playlist_feedback(regenerate)` | `skip_track` |
| R3 | regenerate | "Give me a completely new batch." | `playlist_feedback(regenerate)` | `mood_change` only |
| N1 | negative | "I generally like jazz." | `record_preference` | `playlist_feedback` |
| N2 | negative | "Make it lighter." | `mood_change` | `playlist_feedback` |
| N3 | negative | "Skip." | `skip_track` only | `playlist_feedback`, `mood_change`, `record_preference` |

**Acceptance (#67):** per category (like / dislike / regenerate) correct-tool
rate ≥ **80%**; false-positive rate on N1–N3 ≤ **10%**. Run the sheet on
**3 eval accounts**.

### Scoring grid (copy per account × condition)

| # | Session id | Track idx | Tool fired | Within 5s | Extra tools | Pass |
|---|-----------|-----------|------------|-----------|-------------|------|
| L1 | | | | | | |
| L2 | | | | | | |
| L3 | | | | | | |
| D1 | | | | | | |
| D2 | | | | | | |
| D3 | | | | | | |
| R1 | | | | | | |
| R2 | | | | | | |
| R3 | | | | | | |
| N1 | | | | | | |
| N2 | | | | | | |
| N3 | | | | | | |

Tool-call ground truth: harness log / proxy tool audit, or
`node scripts/feedback-eval.mjs --session <id>` (every `playlist_feedback`
appears in the timeline with `source: dj_tool`).

## Scoring a session (after the block)

```bash
node scripts/feedback-eval.mjs --session <session_id>
```

Checks it automates:

- **#66 capture** — each `playlist_feedback` row has `feedback`, `track_id`,
  `remaining_ids`, `source` (missing fields are flagged); full timeline with
  offsets reproduces the run; `played_track_ids[]` reconstructed from
  `track_started` (never the initial plan).
- **#68 in-session shift** — each like/dislike is paired with its nudge replan:
  `changed_ids` (want ≥1 on dislike), `Δenergy_mean` over the next 2 slots,
  `artist_repeat before→after` (want 0 after a dislike). A missing pair on
  condition B/C means the loop didn't fire; on condition A it's the expected noop.
- **Regenerate** — `changed_count ≥ 1` per `playlist_regenerate_requested`.
- Failures — `taste_feedback_failed` / `replan_failed` events are surfaced.

## Cross-session taste (#69, condition C only)

1. Reset the account's taste (`PUT /users/me/taste` with empty preferences) or
   note the baseline via `node scripts/feedback-eval.mjs --user <user_id>`.
2. Session 1: run a dislike (D1–D3) on an identifiable track; end the session.
3. `node scripts/feedback-eval.mjs --user <user_id>` — expect a
   `session_sourced_taste` row (`avoid`, the track and/or its artist,
   `source: "session"`). Voice like → corresponding `prefer` row.
4. Session 2 (same account, same mood/scene): compare plans —
   `node scripts/feedback-eval.mjs --compare <session1> <session2>` gives the
   played-list Jaccard + energy histograms; the avoided artist/track should be
   underrepresented vs the Session 1 baseline.
5. Anonymous / condition B control: repeat step 2 on B — `--user` must show
   **no new** session-sourced rows.

## Run log template

```
date:        2026-__-__
commit:      <git SHA>
model:       <gemini model id>
condition:   A | B | C
account:     <eval email>
host_mode:   <mode>
session_ids: [...]
sheet:       <link/path to filled scoring grid>
reports:     <feedback-eval.mjs JSON paths>
verdict:     pass | fail + notes
```

Archive the JSON reports (`FEEDBACK_EVAL_OUTPUT=<path>` to control location)
and the filled grid alongside the eval run log.
