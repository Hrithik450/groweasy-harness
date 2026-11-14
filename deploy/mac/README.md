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
```

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
the bundle, reloads every service, prints three health codes.

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
