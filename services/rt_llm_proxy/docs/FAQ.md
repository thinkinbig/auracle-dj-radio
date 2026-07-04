# FAQ — rt-llm-proxy

Frequently asked questions and answers.

## What is rt-llm-proxy?

A **real-time voice proxy** written in Go. Browsers connect via WebRTC, the proxy
bridges to **Gemini Live**, and streams back voice responses in real time.

```
🌐 Browser (WebRTC voice)
    ↓
🖥️  Proxy (this project)
    ↓
🤖 Gemini Live
    ↓
🔊 Voice response
```

In the Auracle monorepo, agent-harness registers sessions and forwards Lane-1
tool calls. See [Integration Guide](INTEGRATION.md).

---

## Which LLM does it support?

Only **Gemini Live** (`?model=gemini` or omit the query param).

Requires a `GEMINI_API_KEY` (or `GOOGLE_API_KEY`).

---

## Can I run it on CPU?

**Yes.** Gemini Live is a cloud API — no GPU needed on the proxy host.

---

## What's the latency?

End-to-end **200–400ms** typical for Gemini Live:

| Component | Latency |
|---|---|
| WebRTC setup | ~100ms |
| Gemini first audio | ~100–300ms |
| Network roundtrips | ~10–50ms |

---

## How many concurrent users?

**Single 16-core box:** ~600–1000 sessions (limited by Opus encode CPU).

**To scale beyond:**
- Vertical: bigger machine (more CPU)
- Horizontal: multiple proxies + TURN/SFU frontend (LiveKit / Pipecat)

This proxy is **single-host only** by design — shared-nothing media routing is hard.

---

## How do I get started?

**Fastest way (5 min):**

```bash
export GEMINI_API_KEY=your_key
go run ./cmd/proxy -addr :8080
# http://localhost:8080/demo/
```

See [Quick Start](QUICK_START.md).

**Auracle full stack:**

```bash
./scripts/dev-stack.sh
# web → http://localhost:5173
```

**With Docker:**

```bash
cp .env.example .env  # Edit: GEMINI_API_KEY=...
docker compose up --build
# http://localhost:8080/demo/
```

---

## How do I use it in production?

1. **Front with a reverse proxy** (Nginx) — TLS termination, load balancing
2. **Enable auth** — `-auth-url` pointing to memory-service
3. **Set register secret** — `PROXY_REGISTER_SECRET` on proxy + harness
4. **Enable Redis** — rate limiting
5. **Enable Kafka** — transcript archival, audit log
6. **Monitor** — CPU, latency, error rates
7. **Add TURN/SFU** (LiveKit / Pipecat) — NAT traversal, horizontal scaling

See [Deployment Guide](DEPLOYMENT.md#production-checklist).

---

## How do I limit requests per user?

Use Redis rate limiting:

```bash
go run ./cmd/proxy \
  -redis localhost:6379 \
  -rl-max 10 \
  -rl-window 1m
```

This allows max 10 **new sessions** per IP per minute. Existing sessions are unlimited.

**Note:** If Redis is down, the proxy allows all requests (fail-open design).

---

## Can I customize the LLM prompt?

**Yes — via push registration** (Auracle pattern):

```
POST /session/{id}/register
Authorization: Bearer <PROXY_REGISTER_SECRET>

{
  "token": "...",
  "systemInstruction": "You are a helpful dance instructor.",
  "tools": [...],
  "openingCue": "..."
}
```

The orchestrator sets `systemInstruction` before the browser connects. See
[Integration Guide](INTEGRATION.md).

---

## Why do I get 403 on connect?

The browser must send `X-Session-Token` matching the `token` from registration
on the **first** connect to a pre-registered session. Reconnects with
`X-Last-Seq` may omit the token.

---

## How do I save transcripts?

Three ways:

1. **Stdout (dev)**:
   ```bash
   go run ./cmd/proxy -sidechannel stdout
   ```

2. **Kafka (production)**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.kafka.yml up
   # Transcripts → Kafka topic "transcripts"
   ```

3. **Data channel (browser)**:
   Demo page shows live transcripts in UI.

---

## Why is performance degrading?

Check **frame latency SLO** (target: <5% of frames ≥30ms late):

```bash
curl http://localhost:6060/stats | jq '.frames_late_30ms'
```

If high, enable **adaptive Opus complexity**:

```bash
go run ./cmd/proxy -adaptive sessions
```

This automatically drops encoding quality under load to preserve real-time delivery.

---

## How do I debug issues?

**Enable admin panel:**

```bash
go run ./cmd/proxy -admin :6060
```

Then:

```bash
# Live stats
curl http://localhost:6060/stats | jq

# Goroutines
curl http://localhost:6060/debug/pprof/goroutine?debug=1

# Heap analysis
go tool pprof http://localhost:6060/debug/pprof/heap
```

**Check logs:**

```bash
docker compose logs -f rt-llm-proxy | grep -i error
```

---

## WebRTC connection fails. What now?

Checklist:

1. Is the proxy running?
   ```bash
   curl http://localhost:8080/stats
   ```

2. Are WebRTC ports open?
   ```bash
   sudo ufw allow 10000:60000/udp
   ```

3. Is your firewall / NAT blocking UDP?
   - The proxy is **not** NAT-traversal infra (no STUN/TURN)
   - It needs a direct path or public IP
   - For production, add TURN (coturn) or SFU (LiveKit)

4. Check the logs:
   ```bash
   docker compose logs rt-llm-proxy | tail -20
   ```

---

## I'm in China. How do I use this?

**Go proxy acceleration (for building):**

```bash
go env -w GOPROXY=https://goproxy.cn,direct
```

Or in Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.cn.yml up --build
```

**Gemini API:** requires reachability to Google APIs. If blocked, deploy the
proxy outside mainland China or use a VPN.

---

## Can it run in Kubernetes?

**Partially:**
- ✅ HTTP control plane (offer endpoint, admin API)
- ❌ WebRTC media (UDP audio has affinity, needs `hostNetwork` or TURN)

**Better approach:**
- Deploy proxy on plain VMs (no K8s)
- Front with TURN + SFU in K8s
- SFU routes media; proxy is just the LLM bridge

---

## How do I monitor in production?

**Key metrics:**

```
frames_late_30ms   → SLO (alert if >5%)
sessions           → capacity tracking
memory_bytes       → leak detection
goroutines         → resource leak
```

**Setup:**

```bash
# Scrape stats endpoint
prometheus:
  - targets: ['localhost:6060/stats']
    
# Alert on high latency
- alert: HighFrameLatency
  expr: frames_late_30ms > 0.05
  for: 5m
```

See [Deployment Guide — Monitoring](DEPLOYMENT.md#monitoring--operations).

---

## Can I use it as a library in my app?

**Yes!** The core is in `internal/model` and `internal/rtc`:

```go
import "rt-llm-proxy/internal/model/gemini"

m, err := gemini.New(ctx, gemini.Config{
    APIKey: os.Getenv("GEMINI_API_KEY"),
    // ...
})
```

But the main proxy (`cmd/proxy`) is the typical entry point.

---

## I found a bug. What do I do?

1. **Check existing issues** on GitHub
2. **Reproduce with logs enabled:**
   ```bash
   go run ./cmd/proxy -admin :6060 2>&1 | tee debug.log
   ```
3. **Post on GitHub** with:
   - Error message
   - Steps to reproduce
   - `curl http://localhost:6060/stats` output
   - Log excerpt

---

## Where's the rest of the documentation?

| Doc | Purpose |
|---|---|
| [Quick Start](QUICK_START.md) | 5-min setup |
| [Integration Guide](INTEGRATION.md) | Auracle wiring |
| [Deployment Guide](DEPLOYMENT.md) | Production deploy |
| [Architecture](ARCHITECTURE.md) | Design deep-dive |
| [README](../README.md) | Feature overview |

---

## Still stuck?

- 📖 Read [Architecture](ARCHITECTURE.md) for deeper understanding
- 💬 Check GitHub Discussions
- 🐛 File an issue with details
- 📚 Review `CONTEXT.md` for domain terms
