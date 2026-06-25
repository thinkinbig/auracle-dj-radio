#!/bin/sh
set -e

cd /app

echo "[agent-harness] starting..."
exec node dist/index.js
