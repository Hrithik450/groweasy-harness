# Mac host deploy

Single Next.js service behind Caddy and a Cloudflare Tunnel. The MacBook is
the server; the tunnel exposes it publicly without opening a port or needing a
static IP.

## Topology

```
browser ──TLS──▶ Cloudflare edge ──tunnel──▶ cloudflared ──▶ Caddy 127.0.0.1:8080
                                                               ├─ /_logs/*  ──▶ log viewer 127.0.0.1:7890
                                                               └─ /*        ──▶ Next.js 127.0.0.1:3000
```

Caddy exists because the tunnel needs one local origin, and because the log
viewer gets basic auth there. Next.js serves pages, API routes and the SSE
session stream itself — there is no separate gateway.

## Directory split

| Path | Holds |
| --- | --- |
| `$REPO_ROOT` (this checkout) | source + `deploy/mac/` config — versioned |
| `~/Programming/servers/harness/release/current` | built snapshot (`current` symlink) |
| `~/Programming/servers/harness/data` | SQLite, temp files — **the only state that matters** |
| `~/Programming/servers/harness/config` | `Caddyfile`, `cloudflared.yml`, `run-app.sh`, `.env` (0600, not in git) |
| `~/Programming/servers/harness/logs` | app, caddy, tunnel, log-viewer, autodeploy logs |

A release carries `.next/`, `public/`, `src/lib/skills/`, a `node_modules`
symlink to the checkout, and a `data` symlink to `$HARNESS_ROOT/data`. Rollback
is a symlink flip; `data` is never inside a release.

`install.sh` reinstalls dependencies (with the launchd Node first on `PATH`)
when the lockfile or the Node ABI changed, so a manual `pnpm install` run under
a different nvm Node cannot leave `better-sqlite3`/`sharp` built for the wrong
runtime.

## Services

LaunchAgents, all `KeepAlive` + `RunAtLoad`:

```
launchctl list | grep hruthik
com.hruthik.harness.app          next start (release/current)
com.hruthik.harness.caddy        reverse proxy + log viewer auth
com.hruthik.harness.tunnel       cloudflared
com.hruthik.harness.logviewer    log viewer on 127.0.0.1:7890
com.hruthik.harness.autodeploy   git poll → install.sh
```

`deploy/mac/install.sh` reloads `app`, `caddy`, `logviewer` and (when a tunnel
config exists) `tunnel`. The autodeploy agent is started on first install and
otherwise left running, so a deploy never restarts itself.

## Environment

`~/Programming/servers/harness/config/.env` is the deployment environment. It
is loaded by `run-app.sh` through Node's `--env-file`; the checkout's `.env` is
not read at runtime. Start from the development `.env` and add the deployment
overrides. Never commit it.

Required app keys (names only — values stay in the server's `.env`):

- `AUTH_SECRET`
- `NEXT_PUBLIC_APP_URL` — the public origin, e.g. `https://uno.mhrithik.com`.
  `NEXT_PUBLIC_*` is inlined at build time, so changing it requires a rebuild.
- Provider keys the app uses: `OPENAI_API_KEY`, `BYTEPLUS_API_KEY`,
  `ELEVENLABS_API_KEY`, `META_APP_ID` / `META_APP_SECRET` /
  `META_ACCESS_TOKEN`, `APIFY_API_TOKEN`, `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
  `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`, `FIRECRAWL_API_KEY`,
  `ALTERNATIVE_WEB_SCRAPER_URL` / `ALTERNATIVE_WEB_SCRAPER_TOKEN`, and the
  `R2_*` set.
- `DATABASE_PATH` / `SCRAPER_DATABASE_PATH` — optional. When unset the app's
  `./data` resolves through the release symlink to
  `~/Programming/servers/harness/data`.

Deploy-only keys (read by `install.sh`; shell environment wins if both set):

- `PUBLIC_URL` — origin used by the public health check. Default
  `https://uno.mhrithik.com`.
- `APP_PORT` (3000), `CADDY_PORT` (8080), `LOG_VIEWER_PORT` (7890).
- `LOG_VIEWER_BASIC_AUTH` — the Caddy `basic_auth` line, e.g.
  `admin <bcrypt-hash>`. Generate the hash with
  `caddy hash-password --plaintext '...'`. If unset, `/_logs` returns 404.
- `SITE_NAME` — label in the log viewer. Default `harness`.
- `AUTODEPLOY_INTERVAL` — poll seconds. Default 60.
- `PUBLIC_HEALTH` — `1` (default) also checks `PUBLIC_URL` through the tunnel.
  Set `0` if Cloudflare Access/challenges make an unauthenticated `curl`
  impossible; local app and Caddy checks still run.
- Tunnel: `CLOUDFLARED_TUNNEL_ID`, `CLOUDFLARED_HOSTNAME` (defaults to the
  `PUBLIC_URL` host), `CLOUDFLARED_CREDENTIALS_FILE` (defaults to
  `~/.cloudflared/<id>.json`), or `TUNNEL_CONFIG_SRC` to copy an existing
  cloudflared config. Without any of these, `install.sh` reuses
  `config/cloudflared.yml` if present and otherwise skips the tunnel service.

Secret placeholders: this directory contains **no** tunnel id, tunnel token,
basic-auth hash or API key. The tunnel id/ingress are rendered from
`cloudflared.config.yml` at install time, and the credential JSON stays in
`~/.cloudflared/` outside the repo.

## Switching the server over

Run on the Mac. Keep the old checkout untouched until the new one is healthy.

```zsh
# 1. New checkout + dependencies
git clone https://github.com/Hrithik450/groweasy-harness.git ~/Programming/groweasy-harness
cd ~/Programming/groweasy-harness
pnpm install --frozen-lockfile

# 2. Deployment env (0600)
mkdir -p ~/Programming/servers/harness/config
cp .env ~/Programming/servers/harness/config/.env   # or start from the old one
chmod 600 ~/Programming/servers/harness/config/.env
# Edit it: NEXT_PUBLIC_APP_URL, AUTH_SECRET, provider/R2 keys, plus the
# deploy-only keys above (LOG_VIEWER_BASIC_AUTH, CLOUDFLARED_* ...).

# 3. Stop the old loop and gateway so they cannot deploy the old repo or
#    fight over services
launchctl bootout gui/$(id -u)/com.hruthik.harness.autodeploy 2>/dev/null || true
launchctl bootout gui/$(id -u)/com.hruthik.harness.gateway    2>/dev/null || true

# 4. First deploy, including database migrations
RUN_MIGRATIONS=1 ./deploy/mac/install.sh

# 5. Verify
launchctl list | grep hruthik
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
curl -sS -o /dev/null -w '%{http_code}\n' https://uno.mhrithik.com/
```

`install.sh` bootstraps the autodeploy agent on its first successful run, so
step 3's stopped loop is replaced by the new repo's loop. Subsequent pushes to
`origin main` deploy within `AUTODEPLOY_INTERVAL` seconds.

Health checks are `GET /` on the app, Caddy, and (when a tunnel is configured)
the public origin. The app's `/` passes through the auth proxy, so a 200 also
means the DB, `AUTH_SECRET` and env loading work.

## Push to deploy

`auto-deploy.sh` polls `origin/main`, fast-forwards only, installs dependencies
when `pnpm-lock.yaml` changed, and runs `install.sh`. It compares `HEAD`
against `config/deployed.sha`, the same contract the host's
`servers/harness/config/auto-deploy.sh` uses; `install.sh` writes the full SHA
after a healthy deploy. A failed build is recorded in `config/deploy.failed`
and retried at most three times per commit.

`install.sh` copies the current `auto-deploy.sh` into `config/`, but a running
loop keeps the copy it started with. After changing that script, restart it:

```zsh
launchctl kickstart -k gui/$(id -u)/com.hruthik.harness.autodeploy
```

```
git push  →  up to 60 s  →  build, publish, reload, health check
logs: ~/Programming/servers/harness/logs/autodeploy.log
```

## Manual rollback

```zsh
ln -sfn ~/Programming/servers/harness/release/releases/<previous-sha7> \
        ~/Programming/servers/harness/release/current
launchctl kickstart -k gui/$(id -u)/com.hruthik.harness.app
```

Rollback swaps the build, not the database. A destructive migration still
needs a separate plan.

## Keep the Mac awake

The host is the server, so macOS idle sleep must be off. Run once:

```zsh
sudo pmset -a sleep 0 disksleep 0 displaysleep 10 powernap 0 standby 0 \
  disablesleep 1 autorestart 1 womp 1 tcpkeepalive 1
```

- `disablesleep 1` keeps services running with the lid closed.
- Keep the Mac on AC power. `disablesleep` will drain the battery.
- `autorestart 1` restarts after a power failure.
- `displaysleep 10` still lets the screen turn off.

FileVault is on, so macOS disables auto-login. After a reboot, LaunchAgents do
not start until someone logs in. Convert the services to LaunchDaemons (or
accept manual login after every reboot) if the host must recover unattended.

## Known limits

- Mac sleeps / reboots / power cut → site down until it comes back. `KeepAlive`
  covers crashes, not power. `sudo pmset -a disablesleep 1` keeps it awake.
- Logging out of the Mac kills the LaunchAgents (they run in the GUI session).
- SQLite means one instance, one writer — do not scale the app horizontally
  without moving storage off the file.
