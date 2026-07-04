# ADR 0001: L4 seamless connection migration is out of scope

- **Status:** Accepted
- **Date:** 2026-06-11
- **Context:** [Scaling & failover](../../README.md#scaling-failover), failover levels L1–L4

## Context

The reconnect/restore work raised a recurring question: should we pursue **L4 —
near-seamless connection migration**, where a live session is moved from one
process/host to another without the client noticing a drop?

A live realtime session has strong **state affinity**. Its state is spread across
places that cannot be serialized and shipped elsewhere mid-flight:

- **Kernel file descriptors** — the WebRTC media path is UDP straight to this
  process; ICE candidate pairs, the DTLS handshake state, and the negotiated
  SRTP keys live in the kernel/socket, bound to this host's IP and ports.
- **In-process media state** — the pion `PeerConnection`, Opus encoder, jitter
  buffers, and pacing timers live in this process's heap.
- **The provider socket** — the upstream WebSocket to Gemini Live is a stateful
  connection owned by Google's server. We cannot hand that socket to another
  process, and the provider's dialogue context lives on their side, not ours.

Migrating L4 would mean reproducing all of the above on a second host while the
client keeps sending RTP to the original 5-tuple. That is the hard part of
"connection migration" and there is no practical way to do it for an arbitrary
WebRTC + provider session.

## Decision

**We do not implement L4.** Seamless connection migration is explicitly out of
scope for this proxy. We do not add fd hand-off, media-state serialization, or
any "move a live session" mechanism.

Instead the realistic target is **L2/L3 reconnect-restore**: the client
re-establishes a fresh connection and the server restores as much session state
as possible from durable, externalized data.

What we *do* have toward the user-visible benefit of L4 (the user barely notices
the drop):

- **L2** — `session_id` is server-minted (or orchestrator-minted in Auracle); the
  client replays `X-Session-ID` + `X-Last-Seq`; the proxy resumes the same-node
  session and reuses the id.
- **L3** — transcript progress is restored from the in-memory archive
  (same-node) or the replay-index service over `user_id` + monotonic `seq`
  (cross-node), and the restored history is replayed to the client UI.
- **L3 model-context restore** — on reconnect the freshly-dialed Gemini session
  is re-seeded with the restored conversation via `model.ContextRestorer`
  (`clientContent` multi-turn injection).

## Consequences

- A reconnect is a **new connection**, never a migrated one. The client always
  re-offers; there is a brief, visible reconnect rather than a seamless handover.
- Restore is **best-effort and text-level**: the model dialogue context is
  re-seeded from restored transcript text, which is not an exact resumption of
  the provider's internal generation state — the model resumes *informed*, not
  necessarily mid-thought.
- `ResolveReplay` runs **before** the model is dialed so restored history is
  available at construction. That ordering is safe: a same-node `memory_hit`
  takes over the old live session, but its transcript is archived on cleanup, so
  if the subsequent dial fails no history is lost (the client can restore from
  the archive).
- For production scale and reachability, front the proxy with a mature media
  layer (coturn for TURN; LiveKit/Pipecat for routing) rather than chasing L4
  inside this repo.
