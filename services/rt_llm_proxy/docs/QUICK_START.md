# Quick Start Guide — rt-llm-proxy

Get rt-llm-proxy running in minutes.

## 5-Minute Setup (Gemini)

### Prerequisites

- Go 1.25+
- libopus dev libraries
- Gemini API key

### Installation

```bash
# Ubuntu/Debian
sudo apt-get install -y libopus-dev libopusfile-dev pkg-config git

# macOS
brew install opus libopusfile pkg-config go
```

```bash
cd services/rt_llm_proxy
export GEMINI_API_KEY=your_key_here
go run ./cmd/proxy -addr :8080
```

Open http://localhost:8080/demo/

---

## Auracle full stack

From the repo root (music-engine + memory-service + agent-harness + proxy + web):

```bash
./scripts/dev-stack.sh
# web → http://localhost:5173
# proxy → http://localhost:8090
```

The dev script passes `-harness-url` and `-auth-url` automatically.

---

## Docker (proxy only)

```bash
cp .env.example .env   # GEMINI_API_KEY=...
docker compose up --build
# http://localhost:8080/demo/
```

---

## What Just Happened?

```
🌐 Browser (WebRTC voice)
    ↓
🖥️  Proxy (Go)
    ↓
🤖 Gemini Live
    ↓
🔊 Audio response
```

The proxy handles WebRTC, Opus, real-time streaming, transcripts, and reconnect.

---

## Optional: Rate limiting (Redis)

```bash
docker compose -f docker-compose.yml -f docker-compose.redis.yml up --build
```

---

## Optional: Transcript logging (Kafka)

```bash
docker compose -f docker-compose.yml -f docker-compose.kafka.yml up --build
```

---

## Monitor

```bash
go run ./cmd/proxy -admin :6060
curl http://localhost:6060/stats | jq
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| WebRTC fails | Proxy reachable? UDP 10000–60000 open? No NAT without TURN |
| 403 on connect | `X-Session-Token` matches registration? |
| Anonymous user | `-auth-url` set? Valid `Authorization: Bearer`? |

---

## Next steps

- [Integration Guide](INTEGRATION.md) — Auracle wiring
- [Deployment Guide](DEPLOYMENT.md) — production
- [FAQ](FAQ.md) — common questions
- [Architecture](ARCHITECTURE.md) — design deep-dive
