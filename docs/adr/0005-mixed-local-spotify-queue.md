# A source-selected server-ranked queue for local or Spotify tracks

> Status update: the original interleaving design below has been narrowed by the
> product source switch. Local mode uses only the local catalog. Spotify mode uses
> only the listener's gathered Spotify library seeds. The shared queue contract,
> server ranking, seed resolution, and per-track playback backend still apply.

Spotify playback already works (`apps/web/src/features/spotify/*`): OAuth, a
Premium Web Playback device, library gathering (`buildSpotifyQueueFromTaste`),
and per-track play. But it was bolted onto the engine as `if (spotifyEnabled)`
branches threaded through `useTrackPlayback`, with a **second, parallel
recommender** (`rankSpotifyTracks` over the user's liked tracks) whose output
lived in an index-aligned side-array (`spotifyQueue[currentTrackIndex]`). Local
and Spotify were two systems glued at the playback layer.

We want the opposite: **one taste-ranked queue that interleaves local and
Spotify tracks**, where each track plays on its native backend and the DJ treats
both as first-class. This is not a backend *toggle* — a single session's queue is
heterogeneous, and the DJ introduces, voices persona/concept for, and replans
around Spotify tracks exactly as it does local ones.

The design splits along the **token boundary**: the Spotify OAuth token lives
only in the browser, while the recommender (`music-engine`) and the DJ brain
(`agent-harness`) live only on the server. Every decision below falls out of
reconciling that split.

## The three phases

```
GATHER (client, token)         RANK (server)                 RESOLVE + PLAY (client, device)
──────────────────────         ─────────────                 ───────────────────────────────
GET /me  (product=premium)
GET /me/top + /me/saved        retrieveCandidates (catalog)
filter is_playable        ──►  + injected Spotify pool  ──►   chooseNext (one energy model)
POST pool → harness                    ▲                              │
                               batched energy-infer LLM               ▼
                               (in async refine)               FlowTrackRef[] with
                               async copywriter → persona      source + inline spotify{}
                                                                      │
                                                                      ▼
                                                          MusicPlayer interface, both
                                                          backends warm, delegate by source
```

## Decisions

1. **Heterogeneous queue, per-track backend.** A session's queue mixes both
   sources; "seamless" means a uniform code path and a DJ that never goes quiet,
   not a mid-song hot-swap (the two backends play different recordings through
   different outputs, so hot-swap is jarring and pointless).

2. **First-class DJ for Spotify tracks.** The DJ introduces and voices them like
   local tracks. This forces the server/harness to *know* the Spotify tracks,
   which is the reason gathering must POST the pool up the wire.

3. **One server-authoritative recommender (not two glued together).** The
   browser gathers a Spotify candidate pool and POSTs it as `TrackCandidate`s
   tagged `source:"spotify"`; `music-engine` drops them into the **same**
   `retrieveCandidates` pool and `chooseNext` ranks local + Spotify together by
   one model. Collapsing two rankers into one is the cleanup this work exists for;
   the candidate-pool seam in `flow/plan.ts` already supports it.

4. **LLM-inferred energy for Spotify candidates.** `chooseNext` ranks on exactly
   one axis — `cost = |candidate.energy − target|` plus energy-based adjacency
   penalties — and Spotify **deprecated `audio-features` on 2024-11-27** for apps
   without prior extended access (new apps get 403, no replacement). So a Spotify
   candidate gets an `energy` value by LLM inference on our existing scale, with
   exact reuse from the local catalog when the track exists there (title+artist
   match). This keeps `chooseNext` and adjacency unchanged.

5. **Energy inference runs in the async refine, off the first-Start critical
   path.** The original framing here ("parallel with the 5–20s flow LLM") was
   stale: the music-selection redesign ([ADR-0001](0001-talk-over-instead-of-crossfade.md)/Epic
   #26) made flow ordering **deterministic** — there is no flow LLM to parallelize
   with. First Start already runs on the LLM-free *provisional* plan, where Spotify
   candidates sit at a placeholder mid energy, so it carries zero inference latency.
   Real energy is supplied by the existing async copywriter refine
   (`refineSessionCopywriting`): one batched structured call over the gathered pool
   (in `agent-harness`, which owns LLM orchestration; `music-engine` stays
   deterministic), which then re-ranks the remaining queue. Exact catalog matches
   are reused (decision 4) so only the remainder is inferred. DJ voicing
   (persona/concept), needed only when the DJ *speaks* a track, rides the same
   async refine (#75): the same title+artist match that reuses a local track's
   energy also reuses its authored persona/concept/lore verbatim; the unmatched
   remainder gets one batched LLM improvisation from title/artist (lore stays
   catalog-only, never improvised). Both backends then resolve through one
   `resolveCueTrack` seam — local slots via the catalog, Spotify slots from inline
   metadata + the resolved voicing — so cues, the opening, and now-playing context
   are source-agnostic. Voicing is best-effort and lazy: catalog matches are seeded
   at session create (so a matched track-0 voices on the opening cue without
   waiting), the improvised remainder lands before those tracks are spoken, and a
   missing blurb falls back to a plain title/artist introduction.

6. **One `MusicPlayer` interface; both backends warm per session.** The WebAudio
   bus carries DJ voice + *local* music; when a Spotify track plays, the DJ voice
   still flows through the bus and only the **music source** moves to Spotify's
   device. So the abstraction is a music-source player only:
   `loadAndPlay / pause / resume / setMusicVolume / dispose` plus normalized
   `onProgress / onDuration / onEnded`. `LocalPlayer` wraps the `<audio>` element +
   bus music-gain; `SpotifyPlayer` wraps the SDK and its 1s poll, emitting the
   same callbacks. Both are instantiated once per session and kept **warm** (the
   idle Spotify device stays connected, its poller gated off) so a local→Spotify
   boundary never stalls on device spin-up. `useTrackPlayback` picks
   `players[track.source]`; the `if (spotifyEnabled)` branches disappear.

7. **The queue contract carries the source inline.** The system is id-centric —
   `FlowTrackRef` is `{ id, flow_position, reason }` and the client resolves
   everything from the catalog by `id`. A Spotify track has no catalog entry, so
   `FlowTrackRef` gains `source: "local" | "spotify"` and an optional
   `spotify?: { uri, title, artist, albumTitle, albumCoverUrl, durationSec }`.
   Local tracks resolve by `id` as before; Spotify tracks are **fully
   self-described inline** — one self-contained queue object, no index-aligned
   side-array, no client-side re-join.

8. **Premium pre-gate; invariant: every queued track is playable.** All
   programmatic Spotify playback requires Premium. At connect we read
   `GET /me`.`product` (we already hold `user-read-private`) and only gather +
   inject Spotify candidates when `product === "premium"`. Free / not-connected →
   local-only queue. The DJ can never commit to a systemically unplayable track.

9. **Gather-time `is_playable` filter + runtime skip-forward.** Market-unplayable
   tracks are filtered during gather (`market=from_token`) so they never enter the
   pool or get teased. The rare *transient* failure (device drop, stale URI) is
   handled by advancing on a short play-start timeout. We deliberately do **not**
   build a local-understudy substitution subsystem unless real usage shows
   transient dead-air is frequent.

10. **Regenerate re-ranks a server-cached pool.** The Spotify candidate source is
    the user's liked-track library, static within a session. The harness caches
    the gathered pool in session state (alongside the session's
    `personalizationContext`);
    regenerate/extend re-rank that cache + local catalog against the new target,
    with **no client round-trip**. Re-gathering would re-fetch identical data and
    tax a latency-sensitive action.

## Why this shape

- **The token boundary dictates the topology.** Gathering must be client-side
  (token); ranking and the DJ must be server-side. C1 (decision 3) is the only
  split that keeps one ranking model *and* a server-aware DJ — the client gathers,
  the server ranks, the client resolves and plays.
- **The energy axis is the load-bearing constraint.** Because `chooseNext` ranks
  purely on energy and Spotify will no longer supply it, the entire unified-ranker
  premise rests on giving Spotify candidates a credible `energy` (decision 4).
  Everything else (deferring inference to the async refine, async copy) exists to
  pay that cost without regressing first-Start latency.
- **DJ voice is orthogonal to the music source.** Recognising that the bus always
  carries the DJ voice — only music moves — is what shrinks the player abstraction
  to a clean swappable interface (decision 6) instead of a second audio
  rearchitecture.

## Consequences

- `packages/shared/src/flow.ts`: `FlowTrackRef` gains `source` + optional
  `spotify{}`; ripples through `api.ts` / `live.ts`. The optional field keeps
  local-only paths backward-compatible.
- `services/music-engine`: `retrieveCandidates` / `plan.ts` accept an injected
  Spotify candidate pool; `chooseNext` is unchanged (energy axis preserved via
  decision 4).
- `services/agent-harness`: receives and **caches** the gathered pool in session
  state (decision 10); runs the batched energy-inference call inside the async
  refine (decision 5); extends the async copywriter (`refineSessionCopywriting`)
  to generate persona/concept for Spotify tracks.
- `apps/web/src/features/spotify`: `buildSpotifyQueueFromTaste` gains the Premium
  check (decision 8) and `is_playable` filter (decision 9); the gathered pool is
  POSTed at session start (ideally prefetched at Spotify-connect time so it is
  ready before `POST /sessions`).
- `apps/web/src/features/radio/effects/useTrackPlayback.ts`: refactored to a
  `MusicPlayer` interface with `LocalPlayer` / `SpotifyPlayer` implementations,
  selected by `track.source`; the `if (spotifyEnabled)` branches are removed.

## Accepted risks

- **DJ ducking is not perfectly uniform.** Over local music it is sample-accurate
  (WebAudio bus); over Spotify it is a laggy device `setVolume`. The talk-over
  feel differs track-to-track — the one place "seamless" has a seam. Preserves the
  talk-over-not-crossfade stance of [ADR-0001](0001-talk-over-instead-of-crossfade.md).
- **LLM-inferred energy is approximate** and may misplace a Spotify track on the
  curve; the adjacency penalty softens but does not fix this. Catalog-match reuse
  is exact where it applies.
- **Gather latency is additive** before the parallel window; mitigated by
  prefetching the library pool when Spotify connects rather than at session start.
