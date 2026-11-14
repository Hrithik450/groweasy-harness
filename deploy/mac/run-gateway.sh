#!/bin/zsh
# Gateway supervisor entry — launchd runs this, not the app directly.
#
# It runs the bundle inside the `current` release, not the checkout: the
# release carries its own workspace packages, so a deploy is rolled back by
# flipping that symlink instead of whichever commit the repo happens to be on.
set -eu

HARNESS_ROOT="${HARNESS_ROOT:-${0:A:h:h}}"
if [ -f "$HARNESS_ROOT/config/paths.env" ]; then
	source "$HARNESS_ROOT/config/paths.env"
fi

RELEASE="$HARNESS_ROOT/release/current"
if [ ! -f "$RELEASE/gateway.mjs" ]; then
	print -u2 "run-gateway: no release at $RELEASE; run deploy/mac/install.sh"
	exit 78
fi

export GATEWAY_ENV_FILE="$HARNESS_ROOT/config/.env"
# Skills are read from disk, so the release ships its own copy.
export SKILL_ROOT="$RELEASE/skills"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

exec /opt/homebrew/bin/node "$RELEASE/gateway.mjs"
