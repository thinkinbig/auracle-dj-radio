# Auracle — Gemini Integration

> Status: **updated 2026-07-04**.
> Gemini remains the Live DJ / language layer. It is no longer responsible for extracting or writing long-term user memory.

---

## Product Mapping

| Product pillar | Runtime owner |
|----------------|---------------|
| Live DJ host | Gemini Live through `rt_llm_proxy` / `agent-harness` registration. |
| Session flow | `music-engine` deterministic planner. |
| Own catalog | Offline catalog pipeline + runtime metadata. |
| Long-term taste | Spotify, read by `apps/web` and sent as a session-start summary. |
| Current-session adaptation | `agent-harness` session state and tools. |

---

## Gemini Responsibilities

Gemini should:

- host the live DJ conversation
- understand user intent through function calling
- speak concise opening / cue / response text
- use the session's `personalizationContext` internally when provided

Gemini should not:

- maintain long-term user memory
- write preferences for future sessions
- choose tracks directly inside the Live session
- read or store raw Spotify history
- expose or recite the user's private taste summary

---

## Live Tool Set

Use these function declarations:

```ts
const tools = [
  "skip_track",
  "mood_change",
  "change_host_mode",
  "pause_playback",
  "playlist_feedback"
];
```

Removed:

```ts
"record_preference"
```

Reason: it promised durable future-session memory. Spotify now owns cross-session taste.

---

## Context Injection

Session registration may include:

```text
CONTEXT (personalization for this session)
{personalizationContext}
Listener intent: mood={mood}, scene={scene}.
```

`personalizationContext` may contain a compact Spotify-derived taste summary for C sessions.

Rules:

- A/B should receive no Spotify personalization context.
- C requires Spotify personalization context.
- The DJ can use the context to shape tone and curation, but should not list or reveal stored listener profile details when asked.
- Session feedback after start updates the queue through tools, not by mutating long-term memory.

---

## Condition Behavior

| Condition | Personalization context | Tools |
|-----------|--------------------------|-------|
| A | none | skip/pause/host mode; mood changes acknowledged without queue mutation |
| B | none | full session adaptation |
| C | Spotify-derived summary required | full session adaptation |

C is not mem0-backed. C is Spotify-backed.

---

## One Session: Calls and Responsibilities

| Timing | Component | Purpose |
|--------|-----------|---------|
| Session start | web | read Spotify taste if C |
| Session start | agent-harness | validate condition and build registration |
| Planning | music-engine | deterministic plan over catalog + optional Spotify seeds |
| Live setup | Gemini Live | receive system instruction and tools |
| Track cues | Gemini Live | speak opening / segue / response |
| User intent | Gemini Live tools | call session tools |
| Replan / feedback | agent-harness + music-engine | mutate only current session queue |
| Events | memory-service | persist analytics/eval data |

---

## Explicit Non-Goals

| Capability | Owner / decision |
|------------|------------------|
| Long-term memory storage | Retired; Spotify provides long-term taste. |
| mem0 extraction | Retired. |
| Qdrant for user memory | Retired. |
| Cross-session skip weighting | Analytics only, not product ranking. |
| `record_preference` | Removed. |

---

## Related Docs

- `auracle_memory_decision.md`
- `auracle_personalization_plan.md`
- `auracle_api_protocol.md`
