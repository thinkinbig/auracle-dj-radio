#!/bin/sh
set -e

. /entrypoint-common.sh

auracle_boot_prepare
auracle_seed_tracks

echo "[entrypoint] starting API server..."
exec node dist/index.js
