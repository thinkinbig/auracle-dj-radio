#!/bin/sh
set -e

cd /app

mkdir -p "$(dirname "${MEMORY_EVENTS_DB_PATH:-/data/auracle-events.sqlite}")"
mkdir -p "$(dirname "${AURACLE_MEM0_HISTORY_DB:-/data/mem0/history.db}")"

echo "[memory-service] starting..."
exec node dist/index.js
