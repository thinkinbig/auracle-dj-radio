#!/bin/sh
set -e

. /entrypoint-common.sh

auracle_boot_prepare

echo "[entrypoint.dev] watching @auracle/shared..."
pnpm --filter @auracle/shared exec tsc -p tsconfig.json --watch --preserveWatchOutput &

pnpm --filter @auracle/shared build

auracle_seed_tracks

echo "[entrypoint.dev] starting API (tsx watch)..."
exec pnpm --filter @auracle/api dev:docker
