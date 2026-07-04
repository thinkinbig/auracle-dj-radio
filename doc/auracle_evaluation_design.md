# Auracle — Evaluation Design

> Status: **updated 2026-07-04** for Spotify-owned long-term taste.
> Supersedes the mem0 / cross-session skip weighting evaluation design.

---

## Evaluation Goal

Measure whether Auracle feels like a coherent live radio DJ and whether personalization improves the session.

The current personalization hypothesis is:

> Spotify taste improves the starting direction of the station, while Auracle's in-session tools improve the live adaptation of the current queue.

---

## Conditions

| Condition | Backend behavior | Live DJ |
|-----------|------------------|---------|
| **A — Baseline** | Fixed queue after creation. No Spotify taste. No session replan. | Same shell; acknowledges but does not promise queue changes. |
| **B — Session-adaptive** | No Spotify taste. Session-level mood changes, like/dislike nudges, and regenerate are enabled. | Same shell. |
| **C — Spotify-personalized + session-adaptive** | Requires Spotify taste summary. Uses Spotify taste for planning; Premium users may also inject Spotify seeds. Session adaptation enabled. | Same shell. |

C does not mean mem0. C means Spotify taste plus current-session adaptation.

Hard rules:

- A/B must not consume Spotify taste summary or seeds.
- C without Spotify taste must fail fast.
- Spotify Premium affects only whether Spotify tracks can appear in the queue.
- Events are recorded for analysis but do not drive future product recommendations.

---

## Subjective Metrics

1-5 Likert:

| Dimension | Question |
|-----------|----------|
| Relevance | Do the tracks fit my mood and context? |
| Coherence | Does the session feel intentionally designed? |
| DJ Experience | Does it feel like a live radio host is present? |
| Personalization | Does it feel selected for me? |

Blindness: A/B/C use the same Web and Live UI. The interface must not expose condition labels.

---

## Objective Metrics

Use `session_events` to reconstruct the actual played sequence, not only the initial plan.

| Metric | Meaning |
|--------|---------|
| Energy Smoothness | Standard deviation of adjacent energy deltas. |
| Arc Adherence | Error against the target energy arc. |
| Genre Diversity | Entropy of genres in the played session. |
| B vs C Jaccard | Overlap between B and C played track ids for the same participant / intent. |
| Replan Delta | Difference in remaining queue after mood_change / feedback. |
| Spotify Mix Rate | For Premium C sessions, share of Spotify-backed tracks in the queue. |

Do not use cross-session skip-rate improvement as a product metric. It is now analytics-only.

---

## Required Events

`session_events` must persist:

| event_type | Required payload |
|------------|------------------|
| `session_created` | `user_id`, `condition`, `intent`, `tracklist`, `spotify_taste_summary_present`, `spotify_seed_count`, `spotify_premium` if known |
| `track_started` / playhead mirror | `track_id`, `index`, backend if known |
| `playlist_feedback` | `feedback`, `track_id`, `remaining_ids`, `source` |
| `playlist_regenerate_requested` | `before`, `after`, `source` |
| `replan` | `mood`, `energy_delta`, `scope`, `before`, `after` |
| `replan_failed` | error |
| `skip_latency` | `track_id`, latency, energy if known |
| `pause_playback` | action |
| `change_host_mode` | host mode |

Retired events:

- `record_preference` is no longer a product tool.
- mem0 write / recall checks are no longer evaluation requirements.

---

## Experiment SOP

1. Use a separate browser profile or machine for each participant.
2. Use a dedicated Auracle auth account when auth is part of the run.
3. For C, connect Spotify before session start.
4. If C cannot read Spotify taste, do not run that C session.
5. Record Spotify Premium status for C.
6. Run A/B/C in counterbalanced order.
7. Keep mood, scene, duration, and host mode policy consistent across conditions.

Recommended scripted interactions:

| Timing | Utterance | Expected |
|--------|-----------|----------|
| Early session | "Make it lighter." | A: no queue change. B/C: replan. |
| Mid-track | "I love this song." | B/C: `playlist_feedback(like)` and possible session nudge. |
| Mid-track | "Not feeling this one." | B/C: `playlist_feedback(dislike)` and possible session nudge. |
| Later | "Skip." | skip only. |

---

## Interpretation

Expected directional results:

- B should improve live control over A.
- C should improve perceived personalization over B when Spotify taste is available.
- Premium C may differ from non-Premium C because mixed Spotify queues are possible.

Report C as two subgroups when relevant:

- C-local: Spotify taste summary only.
- C-mixed: Spotify taste summary plus Spotify seeds.

---

## Related Docs

- `auracle_personalization_plan.md`
- `auracle_memory_decision.md`
- `auracle_feedback_eval_runbook.md`
