#!/bin/sh
set -e

cd /app

mkdir -p "$(dirname "${PROFILE_EVENTS_DB_PATH:-/data/auracle-events.sqlite}")"

echo "[profile-service] starting..."
exec node dist/index.js
