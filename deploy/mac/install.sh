#!/bin/zsh
# Idempotent, atomic install for the Mac host.
#
# Every deploy builds into its own release directory and only a health-checked
# release becomes `current`. Rolling back is a symlink flip, and it covers the
# gateway too — the bundle carries its workspace packages, so the running
# server no longer depends on what the checkout happens to contain.
#
#   release/                      $HARNESS_ROOT/release
#     releases/<sha7>/
#       web/                      built bundle
#       gateway.mjs               bundled gateway (workspace packages inlined)
#       skills/                   SKILL.md tree the gateway reads
#       node_modules -> checkout  shared npm dependencies (not bundled)
#     current -> releases/<sha7>
#
# vs the previous scheme: the gateway used to run `tsx apps/gateway/src`, i.e.
# whatever HEAD was, so a bad server commit could not be reverted. It now runs
# the snapshot.
set -eu

# Self-locating: this script lives at <repo>/deploy/mac/, so the checkout is
# always three directories up. Only HARNESS_ROOT (runtime state, outside any
# checkout) is a chosen path.
REPO_ROOT="${REPO_ROOT:-${0:A:h:h:h}}"
HARNESS_ROOT="${HARNESS_ROOT:-$HOME/Programming/servers/harness}"
PUBLIC_URL="${PUBLIC_URL:-https://uno.mhrithik.com}"
CADDY="${CADDY:-/opt/homebrew/bin/caddy}"

INSTALL=(gateway caddy tunnel logviewer autodeploy)
RESTART=(gateway caddy tunnel logviewer)
DOMAIN="gui/$(id -u)"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
RELEASES="$HARNESS_ROOT/release/releases"
CURRENT="$HARNESS_ROOT/release/current"

cd "$REPO_ROOT"

echo "==> layout"
mkdir -p "$HARNESS_ROOT"/{config,logs,data} "$RELEASES" "$LAUNCH_DIR"
print -r -- "REPO_ROOT=$REPO_ROOT" > "$HARNESS_ROOT/config/paths.env"
print -r -- "HARNESS_ROOT=$HARNESS_ROOT" >> "$HARNESS_ROOT/config/paths.env"

render() {
	sed -e "s|__HARNESS_ROOT__|$HARNESS_ROOT|g" \
	    -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
	    -e "s|__HOME__|$HOME|g" "$1"
}

SHA="$(git rev-parse --short=7 HEAD)"
RELEASE="$RELEASES/$SHA"

# A release directory is the build cache: rebuilding an identical commit would
# pin the CPU for ~90 s and produce byte-identical output.
if [ -f "$RELEASE/web/index.html" ] && [ -f "$RELEASE/gateway.mjs" ]; then
	echo "==> releasing $SHA (already built, reusing)"
else
	echo "==> building release $SHA"
	rm -rf "$RELEASE"
	mkdir -p "$RELEASE"
	# Bundle first: a broken build exits here, before anything is published, so
	# the running site keeps serving the previous release.
	PUBLIC_BASE=/ VITE_GATEWAY_URL="$PUBLIC_URL" pnpm build
	GATEWAY_OUT_DIR="$RELEASE" node_modules/.bin/tsdown --config scripts/tsdown.gateway.config.ts
	# tsdown writes index.js; the release names it for what it is.
	mv "$RELEASE/index.js" "$RELEASE/gateway.mjs"
	rsync -a apps/web/dist/ "$RELEASE/web/"
	cp -R packages/skill "$RELEASE/skills"
	ln -sfn "$REPO_ROOT/node_modules" "$RELEASE/node_modules"
	echo "==> release built ($(du -sh "$RELEASE" 2>/dev/null | cut -f1))"
fi

echo "==> staging config"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
render deploy/mac/Caddyfile > "$STAGE/Caddyfile"
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

echo "==> installing config"
cp "$STAGE/Caddyfile" "$HARNESS_ROOT/config/Caddyfile"
cp deploy/mac/run-gateway.sh deploy/mac/auto-deploy.sh deploy/mac/log-viewer.mjs "$HARNESS_ROOT/config/"
chmod +x "$HARNESS_ROOT/config/run-gateway.sh" "$HARNESS_ROOT/config/auto-deploy.sh"
for label in $INSTALL; do
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
for label in $RESTART; do
	reload "$label" || print -u2 "  $label did NOT load after 8 attempts"
done

healthy() {
	# Declared once, with values: zsh prints the old contents of a bare
	# `local a b c` on each iteration, which looked like a failing check.
	local gateway="" caddy="" public=""
	for attempt in $(seq 1 20); do
		gateway=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:4000/health 2>/dev/null) || gateway=000
		caddy=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:8080/ 2>/dev/null) || caddy=000
		if [ "$gateway" = 200 ] && [ "$caddy" = 200 ]; then
			public=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 "$PUBLIC_URL/health" 2>/dev/null) || public=000
			if [ "$public" = 200 ]; then
				print "  local /health   $gateway"
				print "  caddy /         $caddy"
				print "  public /health  $public"
				return 0
			fi
		fi
		sleep 2
	done
	print "  gateway=$gateway caddy=$caddy public=$public" >&2
	return 1
}

echo "==> health"
if healthy; then
	echo "==> deploy complete ($SHA)"
	# Keep the running release and the one it replaced; drop everything older.
	for dir in "$RELEASES"/*(N/); do
		keep=no
		[ "$dir" = "$RELEASE" ] && keep=yes
		[ -n "$previous" ] && [ "$dir" = "$previous" ] && keep=yes
		[ "$keep" = no ] && rm -rf "$dir"
	done
	exit 0
fi

echo "==> UNHEALTHY — rolling back"
if [ -n "$previous" ]; then
	ln -sfn "$previous" "$CURRENT"
	for label in $RESTART; do reload "$label" >/dev/null 2>&1 || true; done
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
