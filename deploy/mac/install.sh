#!/bin/zsh
# Idempotent, atomic install for the Mac host.
#
# Every deploy builds into its own release directory and only a health-checked
# release becomes `current`. Rolling back is a symlink flip.
#
#   release/
#     releases/<sha7>/
#       .next/                     production build output
#       public/                    static assets Next serves
#       src/lib/skills/            SKILL.md tree read at runtime
#       node_modules -> checkout    shared pnpm dependencies
#       data -> $HARNESS_ROOT/data  persistent SQLite + tmp
#     current -> releases/<sha7>
#
# `next start` runs with the release as its working directory, so it reads the
# build, assets, skills and data from that snapshot — not from whatever the
# checkout happens to contain. A bad server commit is reverted by flipping the
# symlink.
set -eu

# Self-locating: this script lives at <repo>/deploy/mac/, so the checkout is
# always three directories up. Only HARNESS_ROOT (runtime state, outside any
# checkout) is a chosen path.
REPO_ROOT="${REPO_ROOT:-${0:A:h:h:h}}"
HARNESS_ROOT="${HARNESS_ROOT:-$HOME/Programming/servers/harness}"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
RELEASES="$HARNESS_ROOT/release/releases"
CURRENT="$HARNESS_ROOT/release/current"
ENV_FILE="${ENV_FILE:-$HARNESS_ROOT/config/.env}"
DOMAIN="gui/$(id -u)"

NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node)"
PNPM="${PNPM:-/opt/homebrew/bin/pnpm}"
[ -x "$PNPM" ] || PNPM="$(command -v pnpm)"
CADDY="${CADDY:-/opt/homebrew/bin/caddy}"

cd "$REPO_ROOT"

# Read one key from the deploy .env without executing it. The app's .env is
# the single source of truth for deployment values; the shell environment wins
# when both define the same key.
env_get() {
	[ -f "$ENV_FILE" ] || { print -r -- ""; return 0; }
	"$NODE_BIN" -e '
		const fs = require("node:fs");
		const { parseEnv } = require("node:util");
		const values = parseEnv(fs.readFileSync(process.argv[1], "utf8"));
		process.stdout.write(values[process.argv[2]] ?? "");
	' "$ENV_FILE" "$1" 2>/dev/null || true
}

conf() {
	local key="$1" value
	value="${(P)key-}"
	if [ -n "$value" ]; then
		print -r -- "$value"
		return 0
	fi
	env_get "$key"
}

PUBLIC_URL="${PUBLIC_URL:-$(conf PUBLIC_URL)}"
APP_PORT="${APP_PORT:-$(conf APP_PORT)}"
APP_PORT="${APP_PORT:-3000}"
CADDY_PORT="${CADDY_PORT:-$(conf CADDY_PORT)}"
CADDY_PORT="${CADDY_PORT:-8080}"
LOG_VIEWER_PORT="${LOG_VIEWER_PORT:-$(conf LOG_VIEWER_PORT)}"
LOG_VIEWER_PORT="${LOG_VIEWER_PORT:-7890}"
SITE_NAME="${SITE_NAME:-$(conf SITE_NAME)}"
SITE_NAME="${SITE_NAME:-harness}"
AUTODEPLOY_INTERVAL="${AUTODEPLOY_INTERVAL:-$(conf AUTODEPLOY_INTERVAL)}"
AUTODEPLOY_INTERVAL="${AUTODEPLOY_INTERVAL:-60}"
PUBLIC_HEALTH="${PUBLIC_HEALTH:-$(conf PUBLIC_HEALTH)}"
PUBLIC_HEALTH="${PUBLIC_HEALTH:-1}"
LOG_VIEWER_BASIC_AUTH="${LOG_VIEWER_BASIC_AUTH:-$(conf LOG_VIEWER_BASIC_AUTH)}"

# Tunnel settings come from the deploy .env or the shell. No tunnel id, token
# or credential is committed to the repo.
TUNNEL_ID="${CLOUDFLARED_TUNNEL_ID:-$(conf CLOUDFLARED_TUNNEL_ID)}"
TUNNEL_HOSTNAME="${CLOUDFLARED_HOSTNAME:-$(conf CLOUDFLARED_HOSTNAME)}"
TUNNEL_CREDS="${CLOUDFLARED_CREDENTIALS_FILE:-$(conf CLOUDFLARED_CREDENTIALS_FILE)}"
TUNNEL_SRC="${TUNNEL_CONFIG_SRC:-$(conf TUNNEL_CONFIG_SRC)}"
# Fill whichever of the public origin and the tunnel hostname was omitted from
# the other, so a single value configures the health check and the ingress.
if [ -z "$PUBLIC_URL" ]; then
	if [ -n "$TUNNEL_HOSTNAME" ]; then
		PUBLIC_URL="https://$TUNNEL_HOSTNAME"
	else
		PUBLIC_URL="https://uno.mhrithik.com"
	fi
fi
if [ -z "$TUNNEL_HOSTNAME" ]; then
	TUNNEL_HOSTNAME="${PUBLIC_URL#*://}"
	TUNNEL_HOSTNAME="${TUNNEL_HOSTNAME%%/*}"
fi
if [ -z "$TUNNEL_CREDS" ] && [ -n "$TUNNEL_ID" ]; then
	TUNNEL_CREDS="$HOME/.cloudflared/$TUNNEL_ID.json"
fi

echo "==> layout"
mkdir -p "$HARNESS_ROOT"/{config,logs,data} "$RELEASES" "$LAUNCH_DIR"
print -r -- "REPO_ROOT=$REPO_ROOT" > "$HARNESS_ROOT/config/paths.env"
print -r -- "HARNESS_ROOT=$HARNESS_ROOT" >> "$HARNESS_ROOT/config/paths.env"
{
	print -r -- "APP_PORT=$APP_PORT"
	print -r -- "CADDY_PORT=$CADDY_PORT"
	print -r -- "LOG_VIEWER_PORT=$LOG_VIEWER_PORT"
} > "$HARNESS_ROOT/config/ports.env"

# sed replacement escaping: & is the match, | splits s|||, \ escapes.
esc() {
	print -r -- "$1" | sed -e 's/[\\&|]/\\&/g'
}

# Plist values are XML text, so & < > " must be entities before sed sees them.
xml_esc() {
	print -r -- "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'
}

render() {
	sed -e "s|__HARNESS_ROOT__|$(esc "$HARNESS_ROOT")|g" \
	    -e "s|__REPO_ROOT__|$(esc "$REPO_ROOT")|g" \
	    -e "s|__HOME__|$(esc "$HOME")|g" \
	    -e "s|__APP_PORT__|$(esc "$APP_PORT")|g" \
	    -e "s|__CADDY_PORT__|$(esc "$CADDY_PORT")|g" \
	    -e "s|__LOG_VIEWER_PORT__|$(esc "$LOG_VIEWER_PORT")|g" \
	    -e "s|__SITE_NAME__|$(esc "$SITE_NAME")|g" \
	    -e "s|__AUTODEPLOY_INTERVAL__|$(esc "$AUTODEPLOY_INTERVAL")|g" \
	    "$1"
}

render_plist() {
	sed -e "s|__HARNESS_ROOT__|$(esc "$(xml_esc "$HARNESS_ROOT")")|g" \
	    -e "s|__REPO_ROOT__|$(esc "$(xml_esc "$REPO_ROOT")")|g" \
	    -e "s|__HOME__|$(esc "$(xml_esc "$HOME")")|g" \
	    -e "s|__APP_PORT__|$(esc "$(xml_esc "$APP_PORT")")|g" \
	    -e "s|__LOG_VIEWER_PORT__|$(esc "$(xml_esc "$LOG_VIEWER_PORT")")|g" \
	    -e "s|__SITE_NAME__|$(esc "$(xml_esc "$SITE_NAME")")|g" \
	    -e "s|__AUTODEPLOY_INTERVAL__|$(esc "$(xml_esc "$AUTODEPLOY_INTERVAL")")|g" \
	    "$1"
}

# launchd runs /opt/homebrew/bin/node; an interactive `pnpm install` may have
# used another Node (nvm), leaving native modules built for the wrong ABI.
# Reinstall whenever the lockfile or the Node ABI changed.
echo "==> dependencies"
ABI="$("$NODE_BIN" -p 'process.versions.modules')"
ABI_STAMP="$HARNESS_ROOT/config/node-abi"
need_install=no
if [ ! -d node_modules ]; then
	need_install=yes
fi
if [ "$(cat "$ABI_STAMP" 2>/dev/null || true)" != "$ABI" ]; then
	need_install=yes
fi
if [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
	need_install=yes
fi
if [ "$need_install" = yes ]; then
	echo "==> installing dependencies (node ABI $ABI)"
	PATH="/opt/homebrew/bin:$PATH" "$PNPM" install --frozen-lockfile
	print -r -- "$ABI" > "$ABI_STAMP"
fi

SHA="$(git rev-parse --short=7 HEAD)"
HEAD_FULL="$(git rev-parse HEAD)"
RELEASE="$RELEASES/$SHA"

# A release directory is the build cache: rebuilding an identical commit would
# pin the CPU for ~90 s and produce byte-identical output.
if [ -f "$RELEASE/.next/BUILD_ID" ] && [ -d "$RELEASE/public" ] && [ -d "$RELEASE/src/lib/skills" ]; then
	echo "==> releasing $SHA (already built, reusing)"
else
	echo "==> building release $SHA"
	rm -rf "$RELEASE"
	mkdir -p "$RELEASE"
	# Node 26 rejects --env-file when Next forwards exec args to build workers,
	# so load the deploy env here. Process env wins over the checkout's .env.
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
	else
		print -u2 "==> WARNING: $ENV_FILE is missing; building with the checkout's .env"
	fi
	# Build first: a broken build exits here, before anything is published, so
	# the running site keeps serving the previous release.
	"$NODE_BIN" node_modules/next/dist/bin/next build
	# `next start` reads the build, public assets and config from the release.
	rsync -a --delete --exclude 'cache' --exclude 'dev' .next/ "$RELEASE/.next/"
	cp -R public "$RELEASE/public"
	cp package.json next.config.ts tsconfig.json "$RELEASE/"
	# The skill registry reads SKILL.md via process.cwd(), so the snapshot must
	# carry the tree from this commit.
	mkdir -p "$RELEASE/src/lib"
	cp -R src/lib/skills "$RELEASE/src/lib/skills"
	echo "==> release built ($(du -sh "$RELEASE" 2>/dev/null | cut -f1))"
fi

# Dependencies are shared with the checkout; runtime state never lives in a
# release. Refresh both links even when reusing a build.
ln -sfn "$REPO_ROOT/node_modules" "$RELEASE/node_modules"
ln -sfn "$HARNESS_ROOT/data" "$RELEASE/data"

if [ "${RUN_MIGRATIONS:-0}" = 1 ]; then
	echo "==> migrating databases"
	DATABASE_PATH="${DATABASE_PATH:-$HARNESS_ROOT/data/groweasy.db}" \
	SCRAPER_DATABASE_PATH="${SCRAPER_DATABASE_PATH:-$HARNESS_ROOT/data/groweasy-scraper.db}" \
	"$PNPM" db:migrate || {
		print -u2 "migration failed; nothing was published"
		exit 1
	}
fi

echo "==> staging config"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

render deploy/mac/Caddyfile > "$STAGE/Caddyfile"
# The log viewer route is imported as a sibling file so the Caddyfile stays
# valid whether or not basic auth is configured. Without it, the route is
# denied rather than served unauthenticated.
if [ -n "$LOG_VIEWER_BASIC_AUTH" ]; then
	{
		print -r -- "basic_auth {"
		print -r -- "    $LOG_VIEWER_BASIC_AUTH"
		print -r -- "}"
	} > "$STAGE/log-viewer-auth.caddy"
else
	print -r -- "respond 404" > "$STAGE/log-viewer-auth.caddy"
	print -u2 "==> WARNING: LOG_VIEWER_BASIC_AUTH is unset; /_logs will return 404"
fi

INSTALL=(app caddy logviewer autodeploy)
RESTART=(app caddy logviewer)

TUNNEL_ENABLED=no
if [ -n "$TUNNEL_SRC" ] && [ -f "$TUNNEL_SRC" ]; then
	TUNNEL_ENABLED=yes
	cp "$TUNNEL_SRC" "$STAGE/cloudflared.yml"
elif [ -n "$TUNNEL_ID" ]; then
	TUNNEL_ENABLED=yes
	sed -e "s|__TUNNEL_ID__|$(esc "$TUNNEL_ID")|g" \
	    -e "s|__TUNNEL_CREDENTIALS_FILE__|$(esc "$TUNNEL_CREDS")|g" \
	    -e "s|__TUNNEL_HOSTNAME__|$(esc "$TUNNEL_HOSTNAME")|g" \
	    -e "s|__CADDY_PORT__|$(esc "$CADDY_PORT")|g" \
	    deploy/mac/cloudflared.config.yml > "$STAGE/cloudflared.yml"
elif [ -f "$HARNESS_ROOT/config/cloudflared.yml" ]; then
	TUNNEL_ENABLED=yes
	echo "==> reusing existing $HARNESS_ROOT/config/cloudflared.yml"
else
	print -u2 "==> WARNING: no tunnel config; set CLOUDFLARED_TUNNEL_ID or TUNNEL_CONFIG_SRC in $ENV_FILE"
fi
if [ "$TUNNEL_ENABLED" = yes ]; then
	INSTALL+=(tunnel)
	RESTART+=(tunnel)
	render_plist deploy/mac/com.hruthik.harness.tunnel.plist > "$STAGE/tunnel.plist"
fi

if ! "$CADDY" validate --config "$STAGE/Caddyfile" --adapter caddyfile >/dev/null 2>&1; then
	print -u2 "Caddyfile is invalid; nothing was deployed"
	"$CADDY" validate --config "$STAGE/Caddyfile" --adapter caddyfile 2>&1 | tail -3
	exit 1
fi

for label in "${INSTALL[@]}"; do
	if [ "$label" = tunnel ]; then
		continue
	fi
	render_plist "deploy/mac/com.hruthik.harness.$label.plist" > "$STAGE/$label.plist"
done
for label in "${INSTALL[@]}"; do
	if ! plutil -lint "$STAGE/$label.plist" >/dev/null 2>&1; then
		print -u2 "plist for $label is invalid; nothing was deployed"
		exit 1
	fi
done

echo "==> installing config"
cp "$STAGE/Caddyfile" "$STAGE/log-viewer-auth.caddy" "$HARNESS_ROOT/config/"
if [ -f "$STAGE/cloudflared.yml" ]; then
	cp "$STAGE/cloudflared.yml" "$HARNESS_ROOT/config/cloudflared.yml"
fi
cp deploy/mac/run-app.sh deploy/mac/auto-deploy.sh deploy/mac/log-viewer.mjs "$HARNESS_ROOT/config/"
chmod +x "$HARNESS_ROOT/config/run-app.sh" "$HARNESS_ROOT/config/auto-deploy.sh"
for label in "${INSTALL[@]}"; do
	cp "$STAGE/$label.plist" "$LAUNCH_DIR/com.hruthik.harness.$label.plist"
done

previous="$(readlink "$CURRENT" 2>/dev/null || true)"

echo "==> switching current to $SHA"
ln -sfn "$RELEASE" "$CURRENT"

reload() {
	launchctl bootout "$DOMAIN/com.hruthik.harness.$1" 2>/dev/null || true
	# Wait for the old job to disappear: bootstrapping while it is still
	# tearing down fails with "5: Input/output error" and leaves it stopped.
	for _ in $(seq 1 30); do
		launchctl print "$DOMAIN/com.hruthik.harness.$1" >/dev/null 2>&1 || break
		sleep 0.5
	done
	for attempt in $(seq 1 8); do
		launchctl bootstrap "$DOMAIN" "$LAUNCH_DIR/com.hruthik.harness.$1.plist" 2>/dev/null && return 0
		sleep 1
	done
	return 1
}

echo "==> reloading services"
for label in "${RESTART[@]}"; do
	reload "$label" || print -u2 "  $label did NOT load after 8 attempts"
done

healthy() {
	# Declared once, with values: zsh prints the old contents of a bare
	# `local a b c` on each iteration, which looked like a failing check.
	local app="" caddy="" public="skip"
	for attempt in $(seq 1 30); do
		app=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$APP_PORT/" 2>/dev/null) || app=000
		caddy=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$CADDY_PORT/" 2>/dev/null) || caddy=000
		if [ "$app" = 200 ] && [ "$caddy" = 200 ]; then
			if [ "$TUNNEL_ENABLED" = yes ] && [ "$PUBLIC_HEALTH" = 1 ]; then
				public=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 "$PUBLIC_URL/" 2>/dev/null) || public=000
				[ "$public" = 200 ] || { sleep 2; continue; }
			fi
			print "  app /            $app"
			print "  caddy /          $caddy"
			print "  public /         $public"
			return 0
		fi
		sleep 2
	done
	print "  app=$app caddy=$caddy public=$public" >&2
	return 1
}

echo "==> health"
if healthy; then
	echo "==> deploy complete ($SHA)"
	print -r -- "$HEAD_FULL" > "$HARNESS_ROOT/config/deployed.sha"
	rm -f "$HARNESS_ROOT/config/deploy.failed"
	# Keep the running release and the one it replaced; drop everything older.
	for dir in "$RELEASES"/*(N/); do
		keep=no
		[ "$dir" = "$RELEASE" ] && keep=yes
		[ -n "$previous" ] && [ "$dir" = "$previous" ] && keep=yes
		[ "$keep" = no ] && rm -rf "$dir"
	done
	# First install only: start the poll loop. A live loop is left alone so a
	# deploy is never restarted from inside itself.
	if ! launchctl print "$DOMAIN/com.hruthik.harness.autodeploy" >/dev/null 2>&1; then
		launchctl bootstrap "$DOMAIN" "$LAUNCH_DIR/com.hruthik.harness.autodeploy.plist" 2>/dev/null \
			|| print -u2 "  autodeploy did not start; load it manually (see README)"
	fi
	exit 0
fi

echo "==> UNHEALTHY — rolling back"
if [ -n "$previous" ]; then
	ln -sfn "$previous" "$CURRENT"
	for label in "${RESTART[@]}"; do reload "$label" >/dev/null 2>&1 || true; done
	echo "==> health after rollback"
	if healthy; then
		echo "==> rolled back to $(basename "$previous")"
	else
		print -u2 "==> rollback did not restore health; manual attention needed"
	fi
else
	print -u2 "==> no previous release to roll back to"
fi
exit 1
