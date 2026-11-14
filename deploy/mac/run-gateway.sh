#!/bin/zsh
# Gateway supervisor entry — launchd runs this, not the app directly.
#
# `GATEWAY_ENV_FILE` points the gateway's env loader at the deployment config
# rather than the checkout's `.env`, which belongs to local development. Both
# files define DATA_ROOT; only this one may win on the server.
set -eu

HARNESS_ROOT="/Users/hruthikm/Programming/servers/harness"
REPO_ROOT="/Users/hruthikm/Programming/openai-harness"

export GATEWAY_ENV_FILE="$HARNESS_ROOT/config/.env"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$REPO_ROOT"
exec "$REPO_ROOT/node_modules/.bin/tsx" apps/gateway/src/index.ts
