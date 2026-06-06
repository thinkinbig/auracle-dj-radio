#!/bin/sh
# Sourced by prod/dev entrypoints — do not execute directly.

auracle_boot_prepare() {
  cd /app
  mkdir -p "$(dirname "$AURACLE_DB_PATH")" 2>/dev/null || true
  mkdir -p "$(dirname "$AURACLE_MEM0_HISTORY_DB")" 2>/dev/null || true
}

auracle_seed_tracks() {
  echo "[entrypoint] seeding track library..."
  if [ -f dist/db/seed.js ]; then
    node dist/db/seed.js
  else
    pnpm --filter @auracle/api seed
  fi
}
