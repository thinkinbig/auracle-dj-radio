# Auracle — Memory Retirement Decision

> Status: **Superseded / retired** (2026-07-04).
> This document replaces the 2026-06 mem0 OSS decision. The old mem0/Qdrant plan is no longer the product direction.

---

## Decision

Auracle no longer maintains its own cross-session long-term music memory.

| Area | New owner / behavior |
|------|----------------------|
| Cross-session taste | **Spotify** is the provider of long-term taste signals. |
| Live session state | **Auracle** keeps `session_id`, playhead, queue, replan state, DJ tools, and in-session feedback. |
| Durable natural-language memory | **Retired**. No mem0 product path. |
| Vector store | **Retired** for user memory. No Qdrant dependency for personalization. |
| Structured durable taste profile | **Retired** as a product input. No Auracle-owned long-term taste DB. |
| Cross-session skip energy weighting | **Retired from product ranking**. Events may still be analyzed offline. |
| `record_preference` DJ tool | **Removed**. It promised future-session persistence and conflicts with the new boundary. |

## Why

The product now treats Spotify as the listener's long-term taste source. Keeping mem0, Qdrant, `TasteStore`, and skip-rate personalization would create a second taste system with unclear precedence, more privacy surface, and a harder-to-explain evaluation story.

The important distinction is:

- **Spotify taste** answers: what does this listener generally like across sessions?
- **Auracle session** answers: what is happening in this live radio session right now?

Those are separate responsibilities. Auracle should not rebuild Spotify's long-term profile.

## New Personalization Contract

At session start the browser may send:

```ts
{
  condition: "A" | "B" | "C";
  mood: string;
  scene: string;
  spotify_taste_summary?: string;
  seeds?: TrackSeed[];
}
```

Rules:

- **A** ignores Spotify taste and seeds; playlist is fixed after creation.
- **B** ignores Spotify taste and seeds; in-session replan/feedback is enabled.
- **C** requires a Spotify taste summary. If missing, session creation must fail fast rather than silently degrade.
- Spotify **Premium is not required** for C. Premium only controls whether playable Spotify track seeds can be injected into the queue.
- The server does **not** persist raw Spotify top/recent/saved data.

## In-Session Feedback

Auracle still keeps session-scoped adaptation:

- `playlist_feedback(like | dislike)` can nudge the next 1-2 slots.
- `playlist_feedback(regenerate)` can rebuild the upcoming queue.
- `mood_change` can replan remaining tracks according to the current condition.
- These signals live on `SessionState.sessionTaste` or equivalent session state only.
- They do not write durable taste rows or mem0 facts.

## What Remains From `memory-service`

The service name is now misleading. Short term, keep the process to avoid a risky service-boundary refactor, but narrow the responsibility to:

- auth / user identity
- `session_events`
- eval and analytics queries
- compatibility shims while code is migrated

Target naming: `profile-service` or `events-service`. Do not introduce new product memory features under the old `memory-service` name.

## Implementation Implications

1. Rename product-facing `mem0Context` semantics to `personalizationContext`.
2. Stop calling `recallForIntent()`, `remember()`, `tasteWeights()`, and `skipRateByEnergy()` from product planning paths.
3. Remove `record_preference` from Live tools and prompts.
4. Keep event logging, but treat it as analytics/eval input, not recommender state.
5. Keep Spotify OAuth token client-side; server receives only derived summary and session-scoped seeds.
6. Update A/B/C docs: C means Spotify taste personalization plus in-session adaptation.

## Archived Decision

The previous plan was:

- mem0 OSS in `services/memory-service`
- Qdrant vector store
- Gemini embedding / LLM extraction
- per-user recall injected into Flow and DJ prompts
- skip-rate-by-energy as a cross-session ranking signal
- structured durable taste profile with mem0 summary mirroring

That plan is retained only as historical context. It should not be used for new product work.

## Related Docs

- `auracle_personalization_plan.md`
- `auracle_evaluation_design.md`
- `auracle_api_protocol.md`
- `docs/adr/0005-mixed-local-spotify-queue.md`
