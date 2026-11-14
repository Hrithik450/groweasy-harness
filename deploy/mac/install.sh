#!/bin/zsh
# Idempotent install for the Mac host: build, publish the bundle, reload launchd.
#
# Nothing in the repo hardcodes a machine path. The checkout is found from this
# script's own location; runtime state lives under $HARNESS_ROOT and is written
# to `config/paths.env` so the processes that run outside the checkout (the
# gateway, the poller) can find the repo in turn.
#
#   build   pnpm build                  (bakes VITE_GATEWAY_URL into the bundle)
#   publish rsync apps/web/dist         → $HARNESS_ROOT/release/web
#   render  __HARNESS_ROOT__/__REPO_ROOT__ placeholders in the config templates
#   reload  launchctl bootstrap         gateway, caddy, tunnel, logviewer
#
# Usage: ./deploy/mac/install.sh
set -eu

# Self-locating: this script lives at <repo>/deploy/mac/, so the checkout is
# always three directories up. Only HARNESS_ROOT (runtime state, outside any
# checkout) is a chosen path.
REPO_ROOT="${REPO_ROOT:-${0:A:h:h:h}}"
HARNESS_ROOT="${HARNESS_ROOT:-$HOME/Programming/servers/harness}"
PUBLIC_URL="${PUBLIC_URL:-https://uno.mhrithik.com}"

# `autodeploy` is installed but never reloaded here: restarting the poller from
# inside a deploy would kill the deploy that is running.
INSTALL=(gateway caddy tunnel logviewer autodeploy)
RESTART=(gateway caddy tunnel logviewer)

cd "$REPO_ROOT"

echo "==> layout"
mkdir -p "$HARNESS_ROOT"/{config,logs,release/web,data} "$HOME/Library/LaunchAgents"
print -r -- "REPO_ROOT=$REPO_ROOT" > "$HARNESS_ROOT/config/paths.env"
print -r -- "HARNESS_ROOT=$HARNESS_ROOT" >> "$HARNESS_ROOT/config/paths.env"

# Substitute the machine paths into a template from deploy/mac/.
render() {
	sed -e "s|__HARNESS_ROOT__|$HARNESS_ROOT|g" \
	    -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
	    -e "s|__HOME__|$HOME|g" "$1"
}

echo "==> building ($PUBLIC_URL)"
# PUBLIC_BASE=/ keeps asset URLs absolute: on a refresh at /c/<threadId> a
# relative `./assets/…` resolves under /c/ and the history fallback answers
# with HTML instead of JavaScript.
PUBLIC_BASE=/ VITE_GATEWAY_URL="$PUBLIC_URL" pnpm build

echo "==> publishing bundle"
rsync -a --delete apps/web/dist/ "$HARNESS_ROOT/release/web/"

echo "==> rendering config"
render deploy/mac/Caddyfile > "$HARNESS_ROOT/config/Caddyfile"
cp deploy/mac/run-gateway.sh deploy/mac/auto-deploy.sh deploy/mac/log-viewer.mjs "$HARNESS_ROOT/config/"
chmod +x "$HARNESS_ROOT/config/run-gateway.sh" "$HARNESS_ROOT/config/auto-deploy.sh"
for label in $INSTALL; do
	render "deploy/mac/com.hruthik.harness.$label.plist" > "$HOME/Library/LaunchAgents/com.hruthik.harness.$label.plist"
done

echo "==> reloading services"
domain="gui/$(id -u)"
for label in $RESTART; do
	launchctl bootout "$domain/com.hruthik.harness.$label" 2>/dev/null || true
	# bootout is asynchronous: bootstrapping before it settles fails with
	# "Bootstrap failed: 5: Input/output error", leaving the service stopped.
	loaded=no
	for attempt in 1 2 3 4 5; do
		if launchctl bootstrap "$domain" "$HOME/Library/LaunchAgents/com.hruthik.harness.$label.plist" 2>/dev/null; then
			loaded=yes
			break
		fi
		sleep 1
	done
	if [ "$loaded" = no ]; then
		print -u2 "  $label did NOT load after 5 attempts"
	fi
done

echo "==> health"
sleep 6
curl -fsS -o /dev/null -w "  local /health      %{http_code}\n" http://127.0.0.1:4000/health
curl -fsS -o /dev/null -w "  caddy /            %{http_code}\n" http://127.0.0.1:8080/
curl -fsS -o /dev/null -w "  public /health     %{http_code}\n" "$PUBLIC_URL/health"
