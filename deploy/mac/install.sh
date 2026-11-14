#!/bin/zsh
# Idempotent install for the Mac host: build, publish the bundle, reload launchd.
#
# Runtime state never lives in the checkout. It lives in $HARNESS_ROOT, so a
# `git clean` or a rebuild cannot touch the live database.
#
#   build   pnpm build                  (bakes VITE_GATEWAY_URL into the bundle)
#   publish rsync apps/web/dist         → $HARNESS_ROOT/release/web
#   reload  launchctl bootstrap         gateway, caddy, tunnel
#
# Usage: ./deploy/mac/install.sh
set -eu

HARNESS_ROOT="${HARNESS_ROOT:-/Users/hruthikm/Programming/servers/harness}"
REPO_ROOT="${REPO_ROOT:-/Users/hruthikm/Programming/openai-harness}"
PUBLIC_URL="${PUBLIC_URL:-https://uno.mhrithik.com}"
LABELS=(com.hruthik.harness.gateway com.hruthik.harness.caddy com.hruthik.harness.tunnel)

cd "$REPO_ROOT"

echo "==> building ($PUBLIC_URL)"
# PUBLIC_BASE=/ keeps asset URLs absolute: on a refresh at /c/<threadId> a
# relative `./assets/…` resolves under /c/ and the history fallback answers
# with HTML instead of JavaScript.
PUBLIC_BASE=/ VITE_GATEWAY_URL="$PUBLIC_URL" pnpm build

echo "==> publishing bundle"
mkdir -p "$HARNESS_ROOT/release/web" "$HARNESS_ROOT/logs"
rsync -a --delete apps/web/dist/ "$HARNESS_ROOT/release/web/"

echo "==> syncing launchd definitions"
mkdir -p "$HOME/Library/LaunchAgents"
cp deploy/mac/com.hruthik.harness.*.plist "$HOME/Library/LaunchAgents/"
cp deploy/mac/Caddyfile "$HARNESS_ROOT/config/Caddyfile"
cp deploy/mac/run-gateway.sh "$HARNESS_ROOT/config/run-gateway.sh"
chmod +x "$HARNESS_ROOT/config/run-gateway.sh"

echo "==> reloading services"
for label in $LABELS; do
	launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
	launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$label.plist"
done

echo "==> health"
sleep 6
curl -fsS -o /dev/null -w "  local /health      %{http_code}\n" http://127.0.0.1:4000/health
curl -fsS -o /dev/null -w "  caddy /            %{http_code}\n" http://127.0.0.1:8080/
curl -fsS -o /dev/null -w "  public /health     %{http_code}\n" "$PUBLIC_URL/health"
