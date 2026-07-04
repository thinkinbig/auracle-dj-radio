# Integration Guide — embedding rt-llm-proxy

How to wire the voice proxy into a downstream orchestrator. **Auracle** is the
reference integration; the patterns below match `agent-harness` +
`memory-service` in this monorepo.

Composition root: `cmd/proxy/root.go` → `runProxy`.

---

## Pre-prod checklist (Auracle)

| # | Concern | Production wiring |
|---|---|---|
| 1 | **User identity** | `-auth-url http://memory-service:3020` (or `PROXY_AUTH_URL`) — validates browser `Authorization: Bearer` via `GET /auth/me` |
| 2 | **Orchestrator auth** | `PROXY_REGISTER_SECRET` on proxy + harness — gates `POST /session/{id}/{register,inject}` |
| 3 | **Session hijack** | Browser sends `X-Session-Token` on first connect; must match registration |
| 4 | **Lane-1 tools** | `-harness-url http://agent-harness:3030` — server-side tool forwarding for registered sessions |
| 5 | **Personalization** | Push registration (`systemInstruction`, `tools`, `openingCue`) |

Local dev (`./scripts/dev-stack.sh`) sets `-harness-url` and `-auth-url`
automatically. `PROXY_REGISTER_SECRET` is optional in dev (endpoints stay open
with a warning).

---

## 1. Push registration (Lane 0)

Before the browser POSTs SDP, the orchestrator calls:

```
POST /session/{sessionId}/register
Authorization: Bearer <PROXY_REGISTER_SECRET>
Content-Type: application/json

{
  "token": "<per-session uuid>",
  "systemInstruction": "...",
  "tools": [ ... ],
  "openingCue": "..."
}
```

The proxy stores the contract keyed by `sessionId` (TTL 10 min). On the
matching offer it:

- Adopts `X-Session-ID` as the session id (no server remint)
- Applies `systemInstruction`, `tools`, `openingCue` to Gemini setup
- Enables Lane-1 `ToolBackend` when `-harness-url` is set
- Deletes the registration after a successful offer (one-time consume)

**Client offer headers:**

| Header | When | Purpose |
|---|---|---|
| `X-Session-ID` | always (Auracle) | orchestrator-minted id |
| `X-Session-Token` | first connect | must match registration `token` |
| `Authorization: Bearer` | logged-in users | resolved to `user_id` via `-auth-url` |
| `X-Last-Seq` | reconnect | transcript replay (optional) |

TypeScript client: `packages/clients/src/proxy.ts` (`HttpProxyClient`).

---

## 2. User identity

When `-auth-url` is set, `auth.HTTPVerifier` calls `GET {auth-url}/auth/me`
with the browser's Bearer token and maps `user.id` → `identity.UserID`.

Auracle uses memory-service's opaque session tokens (not JWT). Env fallbacks:

```
PROXY_AUTH_URL=http://localhost:3020
MEMORY_SERVICE_URL=http://localhost:3020   # used if PROXY_AUTH_URL unset
```

**Failure policy:** invalid or missing token → anonymous `user_id=""`. Identity
never blocks the media path. Anonymous users cannot reconnect with ownership
binding.

Without `-auth-url`, `DevVerifier` treats the bearer string as the user id
(dev only — logs a warning at startup).

---

## 3. Lane-1 tool forwarding

With `-harness-url`, registered sessions route model `tool_call` events to:

```
POST {harness-url}/sessions/{sessionId}/tool
```

The harness returns `{ gemini_result, ui_events }`; the proxy forwards results
to Gemini and pushes `ui_events` to the browser data channel.

Unregistered sessions (e.g. `/demo/`) keep tools on the browser path.

---

## 4. Lane-3 async inject

After a tool returns, async work (replan, copy updates) lands via:

```
POST /session/{sessionId}/inject
Authorization: Bearer <PROXY_REGISTER_SECRET>

{ "inject_text": "...", "ui_events": [ ... ] }
```

A `404` means the live session ended before the update arrived — expected, not
an error.

---

## 5. Optional: Dev Listener Brief

For local experiments without push registration, `X-Listener-Brief` can provide
a base64 listener brief. Registered Auracle sessions ignore that header;
personalization is entirely in the pushed `systemInstruction`.

---

## 6. Offer endpoint exposure

Browsers must reach `POST /?model=gemini` for WebRTC (Auracle: nginx
`/proxy/`). That is expected.

`POST /session/*/register` and `/inject` should **not** be browser-reachable —
protect with `PROXY_REGISTER_SECRET` and network policy (loopback / internal
network in prod).

Drop `/demo/` in production builds if you don't want a public mic test page.

---

## What you do not need to change

- **Gemini adapter** — credentials via `GEMINI_API_KEY`; behavior via
  `proxy.yaml` or push registration.
- **Transcript / reconnect** — Kafka side-channel and in-memory replay work as
  shipped; optional `-replay-url` for cross-node.
- **Rate limiting** — optional Redis on the offer path only.

See [INDEX.md](INDEX.md) for the full doc map.
