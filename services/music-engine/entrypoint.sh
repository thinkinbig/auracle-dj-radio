#!/bin/sh
set -e

cd /app

DB="${MUSIC_ENGINE_DB_PATH:-/data/auracle-catalog.sqlite}"
mkdir -p "$(dirname "$DB")"

if [ ! -f "$DB" ]; then
  echo "[music-engine] seeding catalog into $DB..."
  MUSIC_ENGINE_DB_PATH="$DB" node dist/seed.js
fi

echo "[music-engine] starting..."
exec node dist/index.js
