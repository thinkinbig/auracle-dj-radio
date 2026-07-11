#!/bin/sh
set -e

cd /app

if [ "${PROFILE_EVENTS_STORE:-sqlite}" = "supabase" ]; then
  if [ -z "${SUPABASE_SECRET_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}" ]; then
    echo "[profile-service] SUPABASE_SECRET_KEY is required when PROFILE_EVENTS_STORE=supabase" >&2
    exit 1
  fi
else
  mkdir -p "$(dirname "${PROFILE_EVENTS_DB_PATH:-/data/auracle-events.sqlite}")"
fi

echo "[profile-service] starting..."
exec node dist/index.js
