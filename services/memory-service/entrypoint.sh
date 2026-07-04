#!/bin/sh
set -e

cd /app

mkdir -p "$(dirname "${MEMORY_EVENTS_DB_PATH:-/data/auracle-events.sqlite}")"

echo "[memory-service] starting..."
exec node dist/index.js
