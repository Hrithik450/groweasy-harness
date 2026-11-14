#!/bin/zsh
# Idempotent, transactional install for the Mac host.
#
# Nothing in the repo hardcodes a machine path. The checkout is found from this
# script's own location; runtime state lives under $HARNESS_ROOT and is written
# to `config/paths.env` so processes that run outside the checkout can find the
# repo in turn.
#
#   build    pnpm build                (fails → nothing on disk changes)
#   stage    render config into a temp dir, validate Caddy + plists
#   snapshot previous bundle and config
#   publish  swap the bundle in, install config, reload services
#   health   gateway, caddy, public — on failure, restore the snapshot
#
# Usage: ./deploy/mac/install.sh
set -eu

# Self-locating: this script lives at <repo>/deploy/mac/, so the checkout is
# always three directories up. Only HARNESS_ROOT (runtime state, outside any
# checkout) is a chosen path.
REPO_ROOT="${REPO_ROOT:-${0:A:h:h:h}}"
HARNESS_ROOT="${HARNESS_ROOT:-$HOME/Programming/servers/harness}"
PUBLIC_URL="${PUBLIC_URL:-https://uno.mhrithik.com}"
CADDY="${CADDY:-/opt/homebrew/bin/caddy}"

# `autodeploy` is installed but never reloaded here: restarting the poller from
# inside a deploy would kill the deploy that is running.
INSTALL=(gateway caddy tunnel logviewer autodeploy)
RESTART=(gateway caddy tunnel logviewer)
DOMAIN="gui/$(id -u)"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
SNAPSHOT="$HARNESS_ROOT/config/previous"

cd "$REPO_ROOT"

echo "==> layout"
mkdir -p "$HARNESS_ROOT"/{config,logs,release/web,data} "$LAUNCH_DIR"
print -r -- "REPO_ROOT=$REPO_ROOT" > "$HARNESS_ROOT/config/paths.env"
print -r -- "HARNESS_ROOT=$HARNESS_ROOT" >> "$HARNESS_ROOT/config/paths.env"

# Substitute the machine paths into a template from deploy/mac/.
render() {
	sed -e "s|__HARNESS_ROOT__|$HARNESS_ROOT|g" \
	    -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
	    -e "s|__HOME__|$HOME|g" "$1"
}

echo "==> building ($PUBLIC_URL)"
# Runs first: a broken build exits here, before any file is replaced, so the
# running site keeps serving the previous bundle.
PUBLIC_BASE=/ VITE_GATEWAY_URL="$PUBLIC_URL" pnpm build

echo "==> staging config"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
render deploy/mac/Caddyfile > "$STAGE/Caddyfile"
# A Caddyfile that does not adapt must never reach the live path: installing it
# and reloading is how the site goes down.
if ! "$CADDY" validate --config "$STAGE/Caddyfile" --adapter caddyfile >/dev/null 2>&1; then
	print -u2 "Caddyfile is invalid; nothing was deployed"
	"$CADDY" validate --config "$STAGE/Caddyfile" --adapter caddyfile 2>&1 | tail -3
	exit 1
fi
for label in $INSTALL; do
	render "deploy/mac/com.hruthik.harness.$label.plist" > "$STAGE/$label.plist"
	if ! plutil -lint "$STAGE/$label.plist" >/dev/null 2>&1; then
		print -u2 "plist for $label is invalid; nothing was deployed"
		exit 1
	fi
done

echo "==> snapshot"
rm -rf "$SNAPSHOT"
mkdir -p "$SNAPSHOT/launchagents"
[ -f "$HARNESS_ROOT/config/Caddyfile" ] && cp "$HARNESS_ROOT/config/Caddyfile" "$SNAPSHOT/Caddyfile"
for label in $INSTALL; do
	[ -f "$LAUNCH_DIR/com.hruthik.harness.$label.plist" ] &&
		cp "$LAUNCH_DIR/com.hruthik.harness.$label.plist" "$SNAPSHOT/launchagents/"
done
rm -rf "$HARNESS_ROOT/release/web.previous"
[ -d "$HARNESS_ROOT/release/web" ] && mv "$HARNESS_ROOT/release/web" "$HARNESS_ROOT/release/web.previous"
mkdir -p "$HARNESS_ROOT/release/web"

echo "==> publishing bundle"
rsync -a apps/web/dist/ "$HARNESS_ROOT/release/web/"

echo "==> installing config"
cp "$STAGE/Caddyfile" "$HARNESS_ROOT/config/Caddyfile"
cp deploy/mac/run-gateway.sh deploy/mac/auto-deploy.sh deploy/mac/log-viewer.mjs "$HARNESS_ROOT/config/"
chmod +x "$HARNESS_ROOT/config/run-gateway.sh" "$HARNESS_ROOT/config/auto-deploy.sh"
for label in $INSTALL; do
	cp "$STAGE/$label.plist" "$LAUNCH_DIR/com.hruthik.harness.$label.plist"
done

# Reload one service. bootout is asynchronous: bootstrapping before it settles
# fails with "Bootstrap failed: 5: Input/output error", leaving it stopped.
reload() {
	launchctl bootout "$DOMAIN/com.hruthik.harness.$1" 2>/dev/null || true
	for attempt in 1 2 3 4 5; do
		launchctl bootstrap "$DOMAIN" "$LAUNCH_DIR/com.hruthik.harness.$1.plist" 2>/dev/null && return 0
		sleep 1
	done
	return 1
}

echo "==> reloading services"
for label in $RESTART; do
	reload "$label" || print -u2 "  $label did NOT load after 5 attempts"
done

# Poll the three surfaces until they answer, or give up.
healthy() {
	for attempt in $(seq 1 20); do
		local gateway caddy public
		gateway=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:4000/health 2>/dev/null || print 000)
		caddy=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:8080/ 2>/dev/null || print 000)
		if [ "$gateway" = 200 ] && [ "$caddy" = 200 ]; then
			public=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 "$PUBLIC_URL/health" 2>/dev/null || print 000)
			if [ "$public" = 200 ]; then
				print "  local /health   $gateway"
				print "  caddy /         $caddy"
				print "  public /health  $public"
				return 0
			fi
		fi
		sleep 2
	done
	print "  gateway=$gateway caddy=$caddy public=${public:-000}" >&2
	return 1
}

echo "==> health"
if healthy; then
	echo "==> deploy complete"
	rm -rf "$HARNESS_ROOT/release/web.previous"
	exit 0
fi

echo "==> UNHEALTHY — rolling back to the previous release"
rm -rf "$HARNESS_ROOT/release/web"
if [ -d "$HARNESS_ROOT/release/web.previous" ]; then
	mv "$HARNESS_ROOT/release/web.previous" "$HARNESS_ROOT/release/web"
else
	print -u2 "  no previous bundle to restore"
fi
[ -f "$SNAPSHOT/Caddyfile" ] && cp "$SNAPSHOT/Caddyfile" "$HARNESS_ROOT/config/Caddyfile"
for label in $INSTALL; do
	[ -f "$SNAPSHOT/launchagents/com.hruthik.harness.$label.plist" ] &&
		cp "$SNAPSHOT/launchagents/com.hruthik.harness.$label.plist" "$LAUNCH_DIR/"
done
for label in $RESTART; do
	reload "$label" >/dev/null 2>&1 || true
done

echo "==> health after rollback"
if healthy; then
	echo "==> rolled back; the site is serving the previous release"
else
	print -u2 "==> rollback did not restore health; manual attention needed"
fi
exit 1
