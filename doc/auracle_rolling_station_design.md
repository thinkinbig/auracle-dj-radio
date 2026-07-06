# Auracle — Rolling Station & on-air queue surgery

> Status: **design locked** (2026-06-27)
> Parent Epic: [GitHub #19](https://github.com/thinkinbig/auracle-dj-radio/issues/19)
> Related: `auracle_flow_prompt_design.md`, `auracle_sound_ia.md`, `docs/adr/0004-end-of-track-talk-window.md`

---

## 1. Problem Statement

The current Station has three product gaps:

| Gap | Symptom | Root cause |
|------|------|------|
| **Doesn't feel like a radio station** | Fixed 8-track session ends → `idle`, back to onboarding | No rolling continuation; no extend at the last track |
| **Replan is imperceptible** | `mood_change` → full replan of remaining, user can't tell anything changed | Small catalog, replan arc is locked into wind-down, hard constraints compress the room to swap tracks |
| **Feedback is invisible** | DJ says "adjusting the next batch," queue UI barely changes | No before/after diff |

`replan` stays as an engine capability, but **should no longer be the default mid-session path**. Cross-session personalization comes from **Spotify taste**; on-air adjustments should be **local, immediate, and visible** changes to the current session only.

---

## 2. Core Decisions

### 2.1 Station model: rolling window, not a fixed session

```
[played …] [current] [remaining ≤ 2] ──background extend──▶ append next batch (default 4 tracks)
```

- The session stays on air until the user actively ends it (returns to setup / closes the page).
- `extend` **only adds, never removes**: it does not change the current track or the already-queued tracks (except to resolve dedup conflicts).
- Semantically distinct from `replan` (which replaces remaining).

### 2.2 Three tiers of on-air adjustment

| Tier | Trigger | Behavior | Calls Flow LLM? |
|------|------|------|-----------------|
| **nudge** | `mood_change` default; `energy_delta` lighter/heavier | Changes only the next **1–2** slots | Yes (`remainingSlots ≤ 2`) |
| **steer** | Significant mood-text change (not a synonym-level tweak) | Refills the **back 50%** of remaining | Yes |
| **full** | UI **Regenerate**; explicit "give me a different batch" | Existing full `replaceRemaining` | Yes |

**Default path**: nudge. Full replan is no longer tied to every offhand mood comment between tracks.

### 2.3 Deterministic signals take priority over waiting for the DJ to call a tool

| Signal | Action |
|------|------|
| Fast skip (<60s) | Deterministic swap of `remaining[0]` (does not call Flow) |
| Queue dislike | Future: swap the next track |
| `playlist_feedback(like/dislike)` | Nudges the next track within the current session; does not write long-term memory |

### 2.4 Visibility

Any queue-change payload carries `changed_ids` / `before_remaining_ids`; the UI highlights for 30s with brief copy ("the next 2 tracks have been updated").

### 2.5 Experiment / Personalization

> **The metrics in this section are stale**: the canonical evaluation metrics are in `auracle_evaluation_design.md` (updated 2026-07-04). This section is kept only as a record of the original design motivation.

- Condition C vs B: primary metrics changed to **opening-plan difference** + **next-track change after a skip** + **Δenergy after a nudge**.
- Full replan is reserved for Regenerate / steer, not the default mood path.

---

## 3. Relationship to Existing Architecture

```
Spotify taste ───────read──▶ createPlan (mode: full)   ← source of cross-session taste
                              │
Station on-air ──────────────┼── extend (append)
                             ├── nudge / steer (partial replan)
                             ├── skip-swap (deterministic)
                             └── full replan (Regenerate only)
```

- **Playhead**: still single-writer in the browser; the harness mirror is used to trigger extend/replan (`CONTEXT.md`).
- **Between-track break** (ADR-0004): still opens a window on non-final tracks; the final track relies on extend to avoid a true "last track."
- **Condition A**: all replan/extend adjustments remain a noop (ablation).

---

## 4. API Sketch

### 4.1 music-engine `POST /plan_tracklist`

| mode | Meaning |
|------|------|
| `full` | Initial 8-track arc (unchanged) |
| `replan` | Replace remaining (Regenerate / steer) |
| `extend` | Append N tracks, excluding played + current |

`extend` body example:

```json
{
  "mode": "extend",
  "intent": { "mood": "calm", "scene": "study", "duration_min": 25 },
  "extend": { "playedIds": ["t01", "…"], "appendSlots": 4 }
}
```

### 4.2 Harness triggers extend

- After `markNowPlaying`: `remaining.length ≤ EXTEND_THRESHOLD` (default 2) → background `extendQueue`.
- Debounce: `extendPending` flag, to avoid a storm of repeated calls.

### 4.3 `tracklist_updated` extended fields

```json
{
  "type": "tracklist_updated",
  "remaining": […],
  "changed_ids": ["t12", "t08"],
  "before_remaining_ids": ["t05", "t11"],
  "session_title": "…"
}
```

`extend` can reuse the same event, or a new `tracklist_extended` (pick one at implementation time; prefer reuse + an `op: "append"` field).

---

## 5. Sub-issue Mapping

| Slice | Issue | Title | Priority |
|-------|-------|------|--------|
| Epic | [#19](https://github.com/thinkinbig/auracle-dj-radio/issues/19) | Rolling Station + on-air queue surgery | — |
| E1 | [#20](https://github.com/thinkinbig/auracle-dj-radio/issues/20) | Rolling extend continuation | P0 |
| E2 | [#22](https://github.com/thinkinbig/auracle-dj-radio/issues/22) | `mood_change` defaults to nudge | P1 |
| E3 | [#23](https://github.com/thinkinbig/auracle-dj-radio/issues/23) | Queue diff visualization | P1 |
| E4 | [#21](https://github.com/thinkinbig/auracle-dj-radio/issues/21) | Skip-driven next-track swap | P1 |
| E5 | [#25](https://github.com/thinkinbig/auracle-dj-radio/issues/25) | Intent tiering: steer / full | P2 |
| E6 | [#24](https://github.com/thinkinbig/auracle-dj-radio/issues/24) | Last-track / idle experience polish | P2 |

Suggested implementation order: **E1 → E4 → E2 → E3 → E5 → E6**

---

## 6. Out of Scope

- Catalog expansion (but [#12](https://github.com/thinkinbig/auracle-dj-radio/issues/12) retrieval quality affects extend/nudge diversity)
- Sound page L1 editing (Epic #3 already done)
- Studio
- Talk break on the final track (off by default; handled by extend instead)

---

## 7. HITL Decisions (E5)

- [x] steer trigger: **pure rules** (mood label normalization + Levenshtein ratio ≥ 0.5 counts as a significant change).
  `energy_delta` lighter/heavier is always a nudge; synonyms/minor tweaks (including substrings) stay a nudge; no LLM classification introduced.
  Implementation: `session/planning/mood-scope.ts` `routeMoodScope()`.
- [x] steer ratio: **back 50%** (`count = ceil(remaining/2)`, keep the head, refill the tail). Implementation: `planning/replan.ts` `scopeWindow()` + `state.ts` `SessionStore.replaceRemaining({ start, count })`.
- [x] extend batch size: **4 tracks** (E1 shipped, `EXTEND_APPEND_SLOTS = 4`).

Three-tier semantics (shipped as E2 + E5):

| scope | trigger | window |
|-------|------|------|
| nudge | `mood_change` default / `energy_delta` lighter·heavier / minor mood tweak | front `min(2, remaining)` slots, keep the tail |
| steer | `mood_change` with a significant mood-label change | back `ceil(remaining/2)` slots, keep the head |
| full  | UI Regenerate (`POST /playlist-feedback` + `feedback:"regenerate"`, `scope:"full"`) | all of remaining |

---

## 8. Discussion Log

**2026-06-27** — Confirmed replan has low product value: narrow trigger surface, catalog is ~40 tracks, replan arc is locked into wind-down, no UI diff. Decision: Rolling Station + nudge as default + extend continuation; full replan is demoted to an explicit Regenerate action.
