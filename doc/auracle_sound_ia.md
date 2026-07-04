# Auracle — Product IA: Station & Sound

> Status: **updated 2026-07-04**.
> The old Sound "taste engineering" plan is retired as a durable Auracle taste system.

---

## New Boundary

| Concept | Meaning | Owner |
|---------|---------|-------|
| **Station** | The current live radio session. | Auracle |
| **Sound** | How the product explains and previews listener taste. | Spotify-derived, not Auracle-owned |
| **Long-term memory** | Cross-session listener taste. | Spotify |

Auracle no longer builds a durable Sound profile with its own onboarding, mem0 learned facts, or skip-rate memory.

---

## Station Responsibilities

Station remains the primary product surface:

- choose mood / scene
- create a live queue
- host with Live DJ
- handle skip, pause, host mode, mood changes
- handle like/dislike/regenerate for this session
- log events for eval and analytics

In-session reactions can shape the rest of the current queue. They do not become future-session taste.

---

## Sound Responsibilities

Sound should become a read-only or lightweight explainability surface for Spotify-derived taste:

- Spotify connection status
- top genres / artists / representative tracks
- whether Premium playback is available
- whether the current C session can use mixed Spotify queue seeds

Do not build:

- Auracle taste onboarding
- editable durable genre/artist/album/track preference DB
- Learned mem0 facts
- Signals that feed product ranking across sessions

Events can still power analytics dashboards, but not the product recommender.

---

## Guest / Non-Spotify Behavior

| User state | Behavior |
|------------|----------|
| Guest | Can run A/B-style local sessions. No long-term personalization. |
| Spotify signed out | Cannot run C. Prompt to connect Spotify. |
| Spotify signed in, non-Premium | C can use taste summary; queue stays local-only. |
| Spotify signed in, Premium | C can use taste summary and Spotify seeds. |

---

## IA Implication

Navigation should avoid promising an editable "taste profile" unless we implement it against Spotify data as a display layer only.

Suggested copy direction:

- "Connect Spotify"
- "Taste source"
- "Spotify taste summary"
- "Use Spotify taste for this station"

Avoid:

- "Auracle remembers"
- "Learned facts"
- "Save preference for later"
- "Train your taste profile"

---

## Related Docs

- `auracle_personalization_plan.md`
- `auracle_memory_decision.md`
- `docs/adr/0005-mixed-local-spotify-queue.md`
