#!/bin/zsh
# Gateway supervisor entry — launchd runs this, not the app directly.
#
# This file lives outside the checkout, in $HARNESS_ROOT/config, so it reads
# the checkout location that `deploy/mac/install.sh` recorded in paths.env.
# Nothing here hardcodes the repository path.
#
# `GATEWAY_ENV_FILE` points the gateway's env loader at the deployment config
# rather than the checkout's `.env`, which belongs to local development. Both
# files define DATA_ROOT; only this one may win on the server.
set -eu

HARNESS_ROOT="${HARNESS_ROOT:-${0:A:h:h}}"

if [ -f "$HARNESS_ROOT/config/paths.env" ]; then
	source "$HARNESS_ROOT/config/paths.env"
fi

if [ -z "${REPO_ROOT:-}" ] || [ ! -d "$REPO_ROOT/apps/gateway" ]; then
	print -u2 "run-gateway: no checkout at REPO_ROOT (${REPO_ROOT:-unset}); run deploy/mac/install.sh"
	exit 78
fi

export GATEWAY_ENV_FILE="$HARNESS_ROOT/config/.env"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$REPO_ROOT"
exec "$REPO_ROOT/node_modules/.bin/tsx" apps/gateway/src/index.ts
