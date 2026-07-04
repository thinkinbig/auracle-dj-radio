# Deployment Guide — rt-llm-proxy

Complete guide to deploying rt-llm-proxy in production and at scale.

## Local Development

### Prerequisites

```bash
# Go 1.25+
go version

# libopus development libraries
sudo apt-get install -y libopus-dev libopusfile-dev pkg-config
# or on macOS:
brew install opus libopusfile pkg-config
```

### Configure Go Proxy (China)

```bash
go env -w GOPROXY=https://goproxy.cn,direct
```

### Run Locally

```bash
export GEMINI_API_KEY=your_key_here
go run ./cmd/proxy -addr :8080

# In another terminal:
curl http://localhost:8080/stats
```

### Auracle Full Stack

From the monorepo root:

```bash
./scripts/dev-stack.sh
# web → http://localhost:5173
# proxy → http://localhost:8090
```

The dev script passes `-harness-url`, `-auth-url`, and optional
`PROXY_REGISTER_SECRET` automatically.

### Debug Mode

```bash
go run ./cmd/proxy \
  -addr :8080 \
  -admin :6060 \
  -sidechannel stdout

# View stats
curl http://localhost:6060/stats | jq

# CPU profile
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30
```

---

## Docker Compose

### Base Stack (Proxy Only)

```bash
cp .env.example .env
# Edit: GEMINI_API_KEY=...
docker compose up --build
# http://localhost:8080/demo/
```

### With Redis (Rate Limiting)

```bash
docker compose -f docker-compose.yml \
               -f docker-compose.redis.yml \
               up --build
```

Enables per-IP rate limiting:
- `-rl-max 10` — max 10 sessions per IP per window
- `-rl-window 1m` — window duration

### With Kafka (Transcript Archival)

```bash
docker compose -f docker-compose.yml \
               -f docker-compose.kafka.yml \
               up --build
```

Transcripts are published to `transcripts` topic (protobuf format).

Consume:
```bash
docker compose exec kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic transcripts
```

### With Both Redis + Kafka

```bash
docker compose -f docker-compose.yml \
               -f docker-compose.redis-kafka.yml \
               up --build
```

---

## Auracle Production (monorepo)

See root `docker-compose.prod.yml`. Key proxy settings:

| Env / flag | Purpose |
|---|---|
| `GEMINI_API_KEY` | Gemini Live API key |
| `PROXY_AUTH_URL` / `-auth-url` | memory-service `GET /auth/me` |
| `PROXY_REGISTER_SECRET` / `-register-secret` | Gates register/inject |
| `-harness-url` | agent-harness Lane-1 tool forwarding |

**Open ports:**
- TCP 8080 (HTTP proxy)
- UDP 10000-60000 (WebRTC media)

---

## China-Specific Setup

### Go Proxy

Set in `.env`:
```bash
GOPROXY=https://goproxy.cn,direct
GOSUMDB=off
```

Or use the CN overlay:
```bash
docker compose -f docker-compose.yml -f docker-compose.cn.yml up --build
```

### Gemini API Reachability

Gemini requires reachability to Google APIs. If blocked, use a VPN or deploy
the proxy outside mainland China. There is no alternate provider in this build.

---

## Configuration Flags

### Essential Flags

```
-addr              :8080              Listen address
-harness-url       ""                 agent-harness base URL (Lane-1 tools)
-auth-url          ""                 auth service base URL (GET /auth/me)
-register-secret   ""                 shared secret for register/inject
-redis             ""                 Redis address (enables rate limit)
-rl-max            10                 Sessions per IP per window
-rl-window         1m                 Rate limit window
-sidechannel       off                Transcript output: off | stdout | kafka
-kafka             localhost:9092     Kafka brokers (csv)
-admin             ""                 Admin listener for /stats and pprof
```

### Opus Tuning

```
-opus-complexity         -1                Complexity 0-10 (-1 = default)
-adaptive                off               Adaptive: off | sessions | drift
-trust-proxy             false             Trust X-Forwarded-For header
```

### Model Circuit Breaker

```
-model-cb               true              Enable circuit breaker
-model-cb-open-after    5                 Failures before opening
-model-cb-open-for      30s               Open duration
-model-cb-auth-open-for 5m                Auth failure duration
```

### Reconnect / Replay

```
-replay-url             ""                Replay-index service URL
-replay-timeout         300ms             Replay lookup timeout
-replay-limit           100               Max replayed transcript lines
```

---

## Monitoring & Operations

### Admin Endpoint

Enable with `-admin :6060`:

```bash
# Stats (JSON)
curl http://localhost:6060/stats | jq

# Goroutines
curl http://localhost:6060/debug/pprof/goroutine?debug=1 | head -20

# Heap dump
curl http://localhost:6060/debug/pprof/heap > heap.prof
go tool pprof heap.prof

# CPU profile
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30
```

### Key Metrics

| Metric | Alert if > |
|---|---|
| `frames_late_30ms` | 5% of total |
| `sessions` | Capacity limit |
| `memory_bytes` | Baseline × 2 |
| `goroutines` | Baseline × 3 |

### Logs

```bash
# Stdout logging
docker compose logs -f rt-llm-proxy

# Search for errors
docker compose logs rt-llm-proxy | grep -i error

# Gemini-specific
docker compose logs rt-llm-proxy | grep gemini
```

### Kafka Monitoring

```bash
# Consumer lag
docker compose exec kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --list

# Topic size
docker compose exec kafka du -sh /var/lib/kafka/data/
```

---

## Troubleshooting

### WebRTC Connection Failed

**Check:**
1. Firewall opens UDP 10000-60000?
   ```bash
   sudo ufw allow 10000:60000/udp
   ```
2. Is proxy running?
   ```bash
   curl http://localhost:6060/stats
   ```
3. Are logs clean?
   ```bash
   docker compose logs rt-llm-proxy | tail -20
   ```

### 403 on Connect (Auracle)

Browser `X-Session-Token` must match the token from
`POST /session/{id}/register`. Registration is one-time consumed after a
successful offer — re-register before a fresh connect.

### High Latency / Frame Drops

1. Check SLO metric:
   ```bash
   curl http://localhost:6060/stats | jq '.frames_late_30ms'
   ```

2. Enable adaptive complexity:
   ```bash
   go run ./cmd/proxy -adaptive sessions
   ```

3. Lower Opus quality:
   ```bash
   go run ./cmd/proxy -opus-complexity 5
   ```

### Memory Leak

1. Check goroutine count:
   ```bash
   curl http://localhost:6060/debug/pprof/goroutine?debug=1 | wc -l
   ```
   Should stay constant after sessions close.

2. Check heap profile:
   ```bash
   go tool pprof http://localhost:6060/debug/pprof/heap
   > top10
   ```

3. Check for Kafka backlog (if sidechannel enabled):
   ```bash
   docker compose exec kafka kafka-consumer-groups.sh \
     --bootstrap-server localhost:9092 \
     --group transcripts --describe
   ```

### Capacity / Scaling Issues

**Single-host ceiling ~600–1000 concurrent sessions:**
- Limited by Opus encode CPU
- Scale up: use `-adaptive sessions` to shed load gracefully

**For horizontal scale (Kubernetes, multi-host):**
- This proxy is **not** designed for K8s without external SFU
- Recommend: front with LiveKit / Pipecat SFU for media routing
- Proxy state is thin (sessions are ephemeral) so stateless is OK

---

## Production Checklist

- [ ] **Secrets**: API keys in secure vault, not `.env`
- [ ] **TLS**: Reverse proxy terminates HTTPS
- [ ] **Auth**: `-auth-url` points to memory-service; DevVerifier disabled
- [ ] **Register secret**: `PROXY_REGISTER_SECRET` set on proxy + harness
- [ ] **Rate limiting**: Redis configured, `-rl-max` set
- [ ] **Transcripts**: Kafka enabled for audit trail
- [ ] **Monitoring**: Admin endpoint secured, metrics scraped
- [ ] **Logs**: Centralized (ELK, Loki, CloudWatch)
- [ ] **Alerts**: Set on frame latency, error rates, goroutine leaks
- [ ] **Backups**: Kafka retention configured
- [ ] **Failover**: Multi-node with TURN/SFU for media routing
- [ ] **Capacity**: Load tested; scaling strategy documented

---

## Performance Tuning

### Opus Complexity vs CPU

| Complexity | CPU / frame | ~sessions/core |
|---|---|---|
| 10 (default) | ~166µs | 107 |
| 5 | ~79µs | 200 |
| 3 | ~60µs | 270 |
| 0 | ~35µs | 330 |

**Recommendation**: Use `-adaptive sessions` — automatically steps down under load.

### Memory & GC

Default Go GC tuning:
```bash
# Reduce GC frequency for lower latency variance
export GOGC=200
go run ./cmd/proxy
```

---

## Example: Complete Production Stack

```bash
# 1. Start all services
docker compose -f docker-compose.yml \
               -f docker-compose.redis-kafka.yml \
               up -d

# 2. Verify health
curl http://localhost:6060/stats | jq '.sessions'

# 3. Set up monitoring
prometheus scrape_interval: 10s
  - targets: ['localhost:6060/stats']

# 4. Set up alerts
- alert: HighFrameLatency
  expr: frames_late_30ms > 5%
  for: 5m
  action: page oncall

# 5. Logs to centralized system
docker compose logs -f | ship-to-loki.sh
```

---

## Glossary

| Term | Meaning |
|---|---|
| **Bridge** | WebRTC endpoint, connects browser to Gemini |
| **Model** | Provider adapter (Gemini Live) |
| **Registration** | Orchestrator-pushed session contract before browser connect |
| **Replay** | Transcript restoration on reconnect |
| **SLO** | Service level objective (e.g., <5% frames ≥30ms late) |

---

## Related Documentation

- [Quick Start](QUICK_START.md) — 5-minute setup
- [Integration Guide](INTEGRATION.md) — Auracle wiring
- [Architecture](ARCHITECTURE.md) — Deep design rationale
- [FAQ](FAQ.md) — Common questions
