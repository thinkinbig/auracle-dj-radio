# End-of-track talk break: a boundary-gated user-voice window

Until now Auracle was a one-way radio. The mic plumbing existed
(`useMicStream` → `startMicCapture` → `sendAudio`) but streamed into the void:
`sendAudio` no-ops without a live socket, there was no UI affordance to talk,
and the only thing that ever entered the `listening` phase was Gemini's native
VAD firing `interrupted`. We are introducing the actual *interaction* feature —
the user can speak to the DJ — and gating **when** they may, rather than leaving
the mic always-on.

We gate the conversation to a **between-tracks talk break** (system-controlled,
not push-to-talk), placed at the **end of each track**. `rt_llm_proxy` informs
the turn-taking design but is **not a runtime dependency**: turn detection stays
on Gemini's native server VAD, and the only new mechanism is a client-side
silence timer.

## Flow (per non-final track)

1. `playing`: at `progress ≥ duration − LEAD` (10s), not final, fire the break —
   send `cue_dj{kind:"break"}`; phase → `speaking`; music ducks to 0.25. The DJ
   **talks over the final seconds** of the still-playing track (preserves
   [ADR-0001](0001-talk-over-instead-of-crossfade.md)).
2. Music ends naturally → **do not advance** (the load-bearing change:
   `onEnded` no longer auto-advances while a break is active).
3. DJ `dj_turn_end` → **window opens**: phase → `listening`; mic forwarding ON;
   silence timer `T_open` (5s); UI shows "Listening… / Continue ▶".
4. **Loop until silence**: a user transcript cancels the silence timer; the DJ
   replies (optional tool: `mood_change`→replan / `record_preference` / pause /
   host_mode); on the reply's `dj_turn_end` the window reopens with a follow-up
   timer `T_follow` (3s).
5. **Terminate** on: silence fires, hard cap (30s OR 3 user turns, whichever
   first), or the user taps Continue → advance to `remaining[0]` (replan-aware);
   next track plays at full.

Opening (track 0) stays a one-way greeting with **no window**; the final track
ends with the outro and **no window**.

## Why this shape

- **Boundary-gated, not always-on**: the mic only forwards PCM during
  `listening`, so the four tools are boundary-gated *for free* and the
  always-on-into-the-void capture is removed. Mic is acquired once at
  `handleStart` (the play gesture grants permission + unlocks autoplay).
- **End-of-track, talk-over trigger**: matches the "between songs" radio mental
  model and keeps talk-over rather than inserting dead air.
- **Two music tracks never overlap**: this is a sequential handoff bridged by
  the DJ voice + window, not a crossfade — the duck-on-`speaking`/`listening`
  and the `listening` phase already exist in `playbackCoordinator`.

## Consequences

- `useTrackPlayback` gains a final-seconds break trigger, moves the DJ cue from
  track-start to the break, and **decouples `advance` from `onEnded`**.
- New `useTalkWindow` hook owns the silence/follow-up timers and the hard cap.
- `useMicStream`/`liveAudio` gate PCM forwarding to the window.
- `dj-prompt.ts` gains a `break` cue kind; `playbackReducer` gains
  `enter_break` / window actions; `ContentSheet`/`MiniControlBar` gain the
  Continue control.
- No new audio nodes, no relay rearchitecture. Reconnect/seq replay
  (`rt_llm_proxy`) is **out of scope** for the Demo.
- Defaults (tune during testing): `LEAD`=10s, `T_open`=5s, `T_follow`=3s,
  cap=30s/3 turns. Pause during a window = treat as Continue (close window, mic
  off) then `paused`.

## Amendment (2026-06-07): skip restores a per-track Cue

The "no start-of-track cue" rule above holds only for the *natural* transition,
where the end-of-track **break** already gave the DJ a turn. A **skip track**
bypasses the break entirely, so under the original rule the skipped-to track
played in silence — which contradicts `CONTEXT.md` ("after a skip track the next
song still gets its own **Cue**") and the listener's expectation that Next makes
the DJ talk.

A manual skip now sends `cue_dj` for the new track (kind omitted; the relay picks
**segue** mid-set or **outro** on the last track). The DJ talks over the new
track's intro — a talk-over per ADR-0001, **not** an end-of-track break: no
listening window opens. Rapid skips interrupt the prior segue via `skip_dj`.
