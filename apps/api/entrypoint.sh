#!/bin/sh
set -e

# Ensure persistent data directories exist
mkdir -p "$(dirname "$AURACLE_DB_PATH")" 2>/dev/null || true
mkdir -p "$(dirname "$AURACLE_MEM0_HISTORY_DB")" 2>/dev/null || true

# Seed track library (upsertTrack is idempotent — safe to run every boot)
echo "[entrypoint] seeding track library..."
node dist/db/seed.js

echo "[entrypoint] starting API server..."
exec node dist/index.js
