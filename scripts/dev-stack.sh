#!/usr/bin/env bash
# Boot the full local dev stack (Phase 3f: browser ⇄ proxy WebRTC).
#
#   music-engine                        :3010
#   memory-service (memory/events/auth) :3020
#   agent-harness (orchestrator)       :3030
#   rt_llm_proxy (Go, WebRTC/media)     :8090  ← rebuilt from source each run
#   web (Vite dev server)               :5173  ← serves the static catalog itself
#
# The catalog/audio is served by Vite from packages/catalog/data (the api service
# was retired). The Go proxy is started with -memory-service pointed at agent-harness
# so push-registration + Lane-1 tools work, and on :8090 so it does NOT clash with a proxy on :8080.
# Vite is pointed at that port. Ctrl-C tears the whole group down.
#
# Ports are overridable: MUSIC_PORT MEMORY_PORT AGENT_PORT PROXY_PORT.

# No `set -e`: a dev launcher should survive one child's non-zero exit rather
# than abort the whole stack (and grep-misses in envget below are expected).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MUSIC_PORT=${MUSIC_PORT:-3010}
MEMORY_PORT=${MEMORY_PORT:-3020}
AGENT_PORT=${AGENT_PORT:-3030}
PROXY_PORT=${PROXY_PORT:-8090}

# The Go proxy reads GEMINI_API_KEY from its environment (it does not load the
# repo-root .env). Lift it (and an optional model override) out without sourcing
# the whole file, so values with spaces can't break the shell.
envget() { { grep -E "^$1=" .env 2>/dev/null || true; } | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
if [ -f .env ]; then
  export GEMINI_API_KEY="${GEMINI_API_KEY:-$(envget GEMINI_API_KEY)}"
  model="$(envget GEMINI_MODEL)"
  if [ -n "$model" ]; then export GEMINI_MODEL="${GEMINI_MODEL:-$model}"; fi
fi
if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "WARN: GEMINI_API_KEY not set — the DJ voice (Gemini Live) will not connect." >&2
fi

# Run a labelled child in the background; its output is line-prefixed. Teardown
# is by process group (kill 0 in the trap), so no PID bookkeeping is needed.
run() {
  local name=$1; shift
  ( "$@" 2>&1 | sed -u "s/^/[$name] /" ) &
}

# kill 0 signals the whole process group (children + the go-built binary).
trap 'echo; echo "shutting down…"; kill 0 2>/dev/null' INT TERM EXIT

run music  env MUSIC_ENGINE_PORT="$MUSIC_PORT" pnpm --filter @auracle/music-engine dev
run memory env MEMORY_SERVICE_PORT="$MEMORY_PORT" \
  pnpm --filter @auracle/memory-service dev
run harness env AGENT_HARNESS_PORT="$AGENT_PORT" \
  MEMORY_SERVICE_URL="http://localhost:$MEMORY_PORT" \
  MUSIC_ENGINE_URL="http://localhost:$MUSIC_PORT" \
  PROXY_URL="http://localhost:$PROXY_PORT" \
  pnpm --filter @auracle/agent-harness dev
run proxy  bash -c "cd services/rt_llm_proxy && exec go run ./cmd/proxy -addr ':$PROXY_PORT' -memory-service 'http://localhost:$AGENT_PORT'"
run web    env AGENT_HARNESS_PROXY_TARGET="http://localhost:$AGENT_PORT" \
  PROXY_PROXY_TARGET="http://localhost:$PROXY_PORT" \
  pnpm --filter @auracle/web dev

echo "stack up → web http://localhost:5173  (proxy :$PROXY_PORT, harness :$AGENT_PORT, memory :$MEMORY_PORT, music :$MUSIC_PORT)"
wait
