#!/usr/bin/env bash
# Boot the full local dev stack (Phase 3f: browser ⇄ proxy WebRTC).
#
#   music-engine                        :3010
#   profile-service (auth/events)        :3020
#   agent-harness (orchestrator)       :3030
#   rt_llm_proxy (Go, WebRTC/media)     :8090  ← rebuilt from source each run
#   web (Vite dev server)               :5173  ← serves the static catalog itself
#
# The catalog/audio is served by Vite from packages/catalog/data (the api service
# The Go proxy is started with -harness-url pointed at agent-harness
# so push-registration + Lane-1 tools work, and on :8090 so it does NOT clash with a proxy on :8080.
# Vite is pointed at that port. Ctrl-C tears the whole group down.
#
# Ports are overridable: MUSIC_PORT PROFILE_PORT AGENT_PORT PROXY_PORT WEB_PORT.

# No `set -e`: grep-misses in envget below are expected. Child process failures
# are handled explicitly in run(), so a port conflict cannot leave a mixed stack.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MUSIC_PORT=${MUSIC_PORT:-3010}
PROFILE_PORT=${PROFILE_PORT:-3020}
AGENT_PORT=${AGENT_PORT:-3030}
PROXY_PORT=${PROXY_PORT:-8090}
WEB_PORT=${WEB_PORT:-5173}

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

# Run a labelled child in the background; its output is line-prefixed. If a
# child exits, tear down the process group so stale ports do not mix checkouts.
run() {
  local name=$1; shift
  (
    trap - INT TERM EXIT
    "$@" 2>&1 | sed -u "s/^/[$name] /"
    status=${PIPESTATUS[0]}
    if [ "$status" -ne 0 ]; then
      echo "[$name] exited with status $status; shutting down stack" >&2
      kill 0 2>/dev/null
    fi
  ) &
}

# kill 0 signals the whole process group (children + the go-built binary).
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "shutting down…"
  kill 0 2>/dev/null
}
trap cleanup INT TERM EXIT

run music  env MUSIC_ENGINE_PORT="$MUSIC_PORT" pnpm --filter @auracle/music-engine dev
run profile env PROFILE_SERVICE_PORT="$PROFILE_PORT" \
  pnpm --filter @auracle/profile-service dev
run harness env AGENT_HARNESS_PORT="$AGENT_PORT" \
  PROFILE_SERVICE_URL="http://localhost:$PROFILE_PORT" \
  MUSIC_ENGINE_URL="http://localhost:$MUSIC_PORT" \
  PROXY_URL="http://localhost:$PROXY_PORT" \
  pnpm --filter @auracle/agent-harness dev
run proxy  bash -c "cd services/rt_llm_proxy && exec go run ./cmd/proxy -addr ':$PROXY_PORT' -harness-url 'http://localhost:$AGENT_PORT' -auth-url 'http://localhost:$PROFILE_PORT'"
run web    env AGENT_HARNESS_PROXY_TARGET="http://localhost:$AGENT_PORT" \
  PROXY_PROXY_TARGET="http://localhost:$PROXY_PORT" \
  WEB_PORT="$WEB_PORT" \
  pnpm --filter @auracle/web dev

echo "stack up → web http://localhost:$WEB_PORT  (proxy :$PROXY_PORT, harness :$AGENT_PORT, profile :$PROFILE_PORT, music :$MUSIC_PORT)"
wait
