#!/bin/sh
set -e

cd /app

# The catalog is loaded into memory from the manifest (baked into the image at
# /app/data) on boot — no SQLite to seed. index.js refuses to start if the
# catalog is empty, so a broken image fails loudly instead of serving empty
# tracklists.
echo "[music-engine] starting..."
exec node dist/index.js
