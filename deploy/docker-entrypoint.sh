#!/bin/sh
set -e

PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"
PUBLIC_URL="${NEXT_PUBLIC_APP_URL:-https://harness.mhrithik.com}"

export DSH_ALLOW_WILDCARD=1
export DSH_WORKSPACES_ROOT="${DSH_WORKSPACES_ROOT:-/srv/workspaces}"
export NODE_ENV=production

mkdir -p "$DSH_WORKSPACES_ROOT"

echo "Starting GrowEasy Harness on ${HOST}:${PORT} (Public URL: ${PUBLIC_URL}, Workspaces: ${DSH_WORKSPACES_ROOT})..."

exec node --import tsx/esm apps/cli/src/bin.ts web \
  --host "$HOST" \
  --port "$PORT" \
  --no-open \
  --trusted-host harness.mhrithik.com \
  --trusted-host localhost \
  --trusted-host 127.0.0.1 \
  --public-url "$PUBLIC_URL" \
  "$@"
