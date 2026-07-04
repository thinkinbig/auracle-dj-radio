# rt-llm-proxy

Real-time voice proxy in Go. Browsers connect over **WebRTC**; the proxy
terminates the peer connection, decodes Opus audio, and bridges it to **Gemini
Live** (`BidiGenerateContent`).

```
browser ──WebRTC(Opus + datachannel)──▶ proxy ──▶ Gemini Live (WebSocket PCM)
        ◀──────────── Opus audio ────────────
```

No STUN/TURN/SFU is configured (`iceServers=[]`, host candidates only) — the
proxy is **not** NAT-traversal infrastructure. Rate limiting is optional and
lives purely on the control plane (the SDP offer endpoint).

In the **Auracle** monorepo, agent-harness pushes a pre-baked session contract
before the browser connects; the proxy adopts the orchestrator's session id and
forwards Lane-1 tool calls back to harness. See
[`docs/INTEGRATION.md`](docs/INTEGRATION.md).

## Quick start

| Goal | Command |
|---|---|
| Gemini Live (local) | `export GEMINI_API_KEY=...` → `go run ./cmd/proxy` → `http://localhost:8080/demo/` |
| Gemini Live (Docker) | `cp .env.example .env` → `docker compose up --build` |
| Full Auracle stack | repo root: `./scripts/dev-stack.sh` |

Domain terms and module seams: [`CONTEXT.md`](CONTEXT.md),
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Provider

Only **`gemini`** is supported (`?model=gemini` or omit the query param).

## Prerequisites

- Go 1.25+
- libopus dev libraries (WebRTC Opus encode/decode via cgo):
  ```
  sudo apt-get install -y libopus-dev libopusfile-dev pkg-config
  ```
- (optional) Redis, for rate limiting

**Go module proxy:** default is `https://proxy.golang.org,direct`. If blocked,
use `go env -w GOPROXY=https://goproxy.cn,direct`.

## Run

```bash
export GEMINI_API_KEY=...            # or GOOGLE_API_KEY
go run ./cmd/proxy -addr :8080
# open http://localhost:8080/demo/
```

### Flags

| flag | default | meaning |
|---|---|---|
| `-addr` | `:8080` | listen address |
| `-harness-url` | `` | agent-harness base URL for Lane-1 tool forwarding |
| `-auth-url` | `` | auth service base URL (`GET /auth/me`); empty → DevVerifier |
| `-register-secret` | `` | shared secret for `POST /session/{id}/{register,inject}` |
| `-redis` | `` (off) | redis address for rate limiting |
| `-rl-max` | `10` | max sessions per client IP per window |
| `-rl-window` | `1m` | rate-limit window |
| `-sidechannel` | `off` | transcript side-channel: `off` \| `stdout` \| `kafka` |
| `-kafka` | `` | kafka seed brokers (csv) for `-sidechannel=kafka` |
| `-kafka-topic` | `transcripts` | kafka topic for transcript events |
| `-replay-url` | `` | replay-index service base URL (cross-node reconnect) |
| `-replay-timeout` | `300ms` | replay lookup budget |
| `-replay-limit` | `100` | max replayed transcript lines per reconnect |
| `-model-cb` | `true` | circuit-break model connect attempts |
| `-admin` | `` (off) | admin listener for `/stats` + `/debug/pprof` |
| `-opus-complexity` | `-1` | Opus encoder complexity 0–10 |
| `-adaptive` | `off` | adaptive complexity: `off` \| `sessions` \| `drift` |
| `-trust-proxy` | `false` | trust `X-Forwarded-For` for rate-limit client IP |

### Environment

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Gemini Live credentials |
| `GEMINI_MODEL` | optional; default `models/gemini-3.1-flash-live-preview` |
| `PROXY_HARNESS_URL` | same as `-harness-url` |
| `PROXY_AUTH_URL` / `PROFILE_SERVICE_URL` | same as `-auth-url` (Auracle: profile-service) |
| `PROXY_REGISTER_SECRET` | same as `-register-secret` |
| `VAD_ENABLED` | optional; gemini barge-in gate |

### Provider behavior via config file

Copy `proxy.yaml.example` → `proxy.yaml`. Provider *behavior* (persona, tools)
lives here; secrets and infrastructure stay on CLI flags / env.

| Section | Key | Effect |
|---|---|---|
| `gemini` | `system_prompt` | Live `systemInstruction` when no push registration |
| `gemini` | `tools` | function-calling declarations (demo / non-Auracle paths) |

**Auracle path:** agent-harness pushes `systemInstruction`, `tools`, and
`openingCue` via `POST /session/{id}/register` before the browser offers SDP.
The proxy does not assemble prompts itself.

**Tool calling.** With `-harness-url` set and a registered session, model tool
calls are forwarded server-side to agent-harness (`POST /sessions/{id}/tool`).
Unregistered sessions keep the browser-side data-channel path.

**Per-session listener brief.** Optional `X-Listener-Brief` header (base64) for
dev / non-Auracle orchestrators. Auracle uses push registration instead.

## Auracle integration (summary)

```
agent-harness  POST /session/{id}/register  (Bearer PROXY_REGISTER_SECRET)
       ↓
browser        POST /?model=gemini  (X-Session-ID, X-Session-Token, Authorization)
       ↓
rt-llm-proxy   WebRTC ↔ Gemini Live
       ↓
agent-harness  POST /sessions/{id}/tool   (Lane 1, from proxy)
               POST /session/{id}/inject  (Lane 3, async nudges)
```

Full checklist: [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

## Layout

```
cmd/proxy/              HTTP entrypoint, wiring, admin
internal/rtc/           pion WebRTC bridge + session registry
internal/offer/         SDP offer intake, registration, inject, replay
internal/model/gemini/  Gemini Live adapter
internal/model/         Model seam (interface)
internal/auth/          Bearer → user id (HTTPVerifier or DevVerifier)
internal/sidechannel/   transcript tap → Kafka/stdout
internal/replayindex/   optional cross-node replay client
internal/audio/         Opus encode/decode + resampler
internal/ratelimit/     Redis fixed-window limiter
demo/                   minimal browser client
docs/                   architecture & integration notes
```

## Docker Compose

```bash
cp .env.example .env   # set GEMINI_API_KEY
docker compose up --build
# http://localhost:8080/demo/
```

Optional overlays: `docker-compose.redis.yml`, `docker-compose.kafka.yml`,
`docker-compose.redis-kafka.yml`, `docker-compose.cn.yml`.

Production Auracle stack: repo-root `docker-compose.prod.yml`.

## Scaling & failover

Single reachable host / vertical scaling. Failover levels L1–L3 (reconnect +
transcript restore) are implemented; L4 seamless migration is out of scope —
see [ADR 0001](docs/adr/0001-l4-connection-migration-impractical.md).

On reconnect, gemini is re-seeded via `model.ContextRestorer` from restored
transcript text (best-effort, not mid-thought exact).

For production reachability, front with coturn (TURN) or an SFU (LiveKit,
Pipecat) rather than expecting this proxy to traverse NAT at scale.

## Notes / known limitations

- **Resampling is linear interpolation** — fine for speech at integer ratios.
- **Rate limiting fails open** if Redis is unreachable.
- **Auth fails open** — invalid Bearer degrades to anonymous; media is never
  blocked by identity failure.
- **Registration token** — first connect to a pre-registered session requires
  `X-Session-Token`; reconnect with `X-Last-Seq` may omit it.
