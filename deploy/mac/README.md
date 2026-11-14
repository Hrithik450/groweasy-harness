# Mac host — uno.mhrithik.com

Temporary deployment for team testing. The MacBook is the server; Cloudflare
Tunnel exposes it publicly without opening a port or needing a static IP.

## Topology

```
browser ──TLS──▶ Cloudflare edge ──tunnel──▶ cloudflared ──▶ Caddy :8080
                                                               ├─ /            release/web (SPA)
                                                               └─ /api/*  ──▶  gateway 127.0.0.1:4000
```

Caddy exists because the gateway deliberately serves no static files: the
bundle and the API must share one origin, or every relative `/api/...` call
and the session cookie break.

## Directory split

| Path | Holds |
| --- | --- |
| `$REPO_ROOT` (this checkout) | source + `deploy/mac/` config — versioned |
| `~/Programming/servers/harness/release/web` | built bundle |
| `~/Programming/servers/harness/data` | `DATA_ROOT`: database, sessions, users — **the only state that matters** |
| `~/Programming/servers/harness/config` | `Caddyfile`, `run-gateway.sh`, `.env` (0600, not in git) |
| `~/Programming/servers/harness/logs` | gateway, caddy, tunnel logs |

Siblings under `~/Programming/servers/` are free for other deployments.

## Services

LaunchAgents, all `KeepAlive` + `RunAtLoad`:

```
launchctl list | grep hruthik
com.hruthik.harness.gateway
com.hruthik.harness.caddy
com.hruthik.harness.tunnel
com.hruthik.harness.autodeploy
```

## Log viewer

```
https://uno.mhrithik.com/_logs/     (basic auth: admin / see .env LOG_VIEWER_PASSWORD)
```

One page, six tabs: `gateway`, `gateway-errors`, `caddy`, `caddy-errors`,
`tunnel`, `autodeploy`. Refreshes every 5 s while "follow" is checked; errors
are coloured red, warnings amber.

`log-viewer.mjs` binds `127.0.0.1:7890` and does **no** authentication of its
own — Caddy's `basic_auth` on `handle_path /_logs*` is the only gate. Never
expose port 7890 directly. It serves only the six names in its `FILES` map, so
a crafted `?file=` cannot read anything else.

To change the password:

```
caddy hash-password --plaintext 'new-password'
```

paste the hash into `basic_auth` in the Caddyfile, then
`launchctl kickstart -k gui/$(id -u)/com.hruthik.harness.caddy`.

## Push to deploy

`auto-deploy.sh` polls `origin/main` every 60 seconds. When the remote moves
ahead of the checkout it fast-forwards, installs dependencies if
`pnpm-lock.yaml` changed, and runs `install.sh`.

```
git push                →  up to 60 s  →  build, publish, reload, health check
logs: ~/Programming/servers/harness/logs/autodeploy.log
```

It fast-forwards only. A diverged branch, a dirty checkout, or a failed build
is logged and **nothing is deployed** — the running build stays up, so a bad
push cannot take the site down. To deploy something it refused, fix the
checkout and stop/start the agent:

```
launchctl kickstart -k gui/$(id -u)/com.hruthik.harness.autodeploy
```

Set `AUTODEPLOY_INTERVAL` (seconds) in the plist to change the poll rate. The
agent is deliberately **not** in `install.sh`'s reload list: restarting it from
inside a deploy would kill the deploy that is running.

They run in the GUI session, so the Mac must stay **logged in**. `disablesleep`
keeps it awake with the lid closed:

```
sudo pmset -a disablesleep 1
```

## Deploying a change

```
./deploy/mac/install.sh
```

Builds with `VITE_GATEWAY_URL=https://uno.mhrithik.com` baked in, republishes
the bundle, renders the config templates, reloads every service, prints three
health codes.

**No machine path is committed.** The repo is the source of truth:

- `install.sh` finds the checkout from its own location (`deploy/mac/` → three
  levels up), so a clone works anywhere.
- The plists and `Caddyfile` carry `__HARNESS_ROOT__` / `__REPO_ROOT__` /
  `__HOME__` placeholders, substituted into `~/Library/LaunchAgents` and
  `$HARNESS_ROOT/config` at install time.
- `install.sh` writes `$HARNESS_ROOT/config/paths.env` with the resolved
  `REPO_ROOT` and `HARNESS_ROOT`. Everything that runs *outside* the checkout
  (`run-gateway.sh`, `auto-deploy.sh`) reads that file, then falls back to its
  own location.

Overrides, for a second deployment on the same machine:

```
HARNESS_ROOT=~/Programming/servers/other PUBLIC_URL=https://other.example ./deploy/mac/install.sh
```

## Environment

`~/Programming/servers/harness/config/.env` — full key set copied from the
development `.env`, with deployment overrides appended. The gateway reads it
through `GATEWAY_ENV_FILE`; the checkout's own `.env` stays local-only.
`loadEnvFile` overwrites inherited variables, so both files defining
`DATA_ROOT` would otherwise resolve to the development value.

`NEXT_PUBLIC_GATEWAY_URL` / `GATEWAY_ALLOWED_ORIGINS` are set to the public
origin. The **browser** origin is compiled in by `VITE_GATEWAY_URL` at build
time — changing the domain means rebuilding, not just editing `.env`.

`PUBLIC_BASE=/` is required as well. The bundle defaults to relative asset
URLs so it can mount under any directory, but a refresh at `/c/<threadId>`
then requests `/c/assets/…`, which the history fallback answers with
`index.html` — HTML served as JavaScript, and a blank page.

## When the real server arrives

Port `deploy/mac/` as-is: the Caddyfile needs only its `root` line changed, and
the gateway runs the same way under systemd (`X-GATEWAY_ENV_FILE` equivalent is
the `GATEWAY_ENV_FILE` environment variable). SQLite means **one instance, one
writer** — do not scale the gateway horizontally without moving storage off the
file.

## Voice catalog

`GET /api/attachments/audios/<name>` serves the shared voice previews. They are
**not** stored on the host: the catalog lives in R2 at
`R2_AUDIO_PREVIEW_ROOT` (default `harness/audio-previews/`) and is read into an
in-memory LRU (48 MB ceiling — the whole catalog is ~29 MB). A restart refills
it from R2 on first play; nothing is written to `DATA_ROOT`.

To publish or replace previews, upload them to that prefix:

```
aws s3 cp <dir> s3://groweasy/harness/audio-previews/ --recursive \
  --content-type audio/mpeg --endpoint-url https://<account>.r2.cloudflarestorage.com
```

## Known limits

- Mac sleeps / reboots / power cut → site down until it comes back. `KeepAlive`
  covers crashes, not power.
- Logging out of the Mac kills the LaunchAgents.
- Attachments require the R2 credentials in `.env`; there is no local fallback.
