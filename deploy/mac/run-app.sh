#!/bin/zsh
# Next.js supervisor entry — launchd runs this, not `next` directly.
#
# It runs the build inside the `current` release, not the checkout, so a deploy
# is rolled back by flipping that symlink instead of whichever commit the repo
# happens to be on.
set -eu

HARNESS_ROOT="${HARNESS_ROOT:-${0:A:h:h}}"
if [ -f "$HARNESS_ROOT/config/paths.env" ]; then
	source "$HARNESS_ROOT/config/paths.env"
fi
if [ -f "$HARNESS_ROOT/config/ports.env" ]; then
	source "$HARNESS_ROOT/config/ports.env"
fi

RELEASE="$HARNESS_ROOT/release/current"
if [ ! -f "$RELEASE/.next/BUILD_ID" ]; then
	print -u2 "run-app: no release at $RELEASE; run deploy/mac/install.sh"
	exit 78
fi

NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node)"
NEXT_BIN="$RELEASE/node_modules/next/dist/bin/next"
if [ ! -f "$NEXT_BIN" ]; then
	print -u2 "run-app: next is missing from $RELEASE/node_modules; run pnpm install"
	exit 78
fi

ENV_FILE="${ENV_FILE:-$HARNESS_ROOT/config/.env}"
APP_PORT="${APP_PORT:-3000}"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# next start must see the release as the project root: it reads .next, public
# and the runtime SKILL.md tree from there.
cd "$RELEASE"

# Node 26 rejects --env-file when Next forwards it to workers; export instead.
# Existing launchd values still win (missing keys are filled from the file).
if [ -f "$ENV_FILE" ]; then
	source <("$NODE_BIN" -e '
		const fs = require("node:fs");
		const { parseEnv } = require("node:util");
		const values = parseEnv(fs.readFileSync(process.argv[1], "utf8"));
		const sq = String.fromCharCode(39);
		const quote = (v) => sq + String(v).replaceAll(sq, sq + "\\" + sq + sq) + sq;
		for (const [key, value] of Object.entries(values)) {
			if (process.env[key] === undefined) console.log("export " + key + "=" + quote(value));
		}
	' "$ENV_FILE")
fi
exec "$NODE_BIN" "$NEXT_BIN" start -H 127.0.0.1 -p "$APP_PORT"
