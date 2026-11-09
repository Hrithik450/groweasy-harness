# @openai-harness/api-gateway

Cordis service `typertGateway`: the `/api` unary interceptor, the
`/api/remote.mux` WebSocket mux, and the browser mux client exported as
`./client`.

What it owns:
- unary Session endpoint dispatch over the injected `sessionController`
  service;
- `RemoteStreamMuxServer` — per-connection serialized writes, heartbeat
  liveness, both close codes, and the bounded uplink inbox;
- the canonical `session/follow` endpoint name and handoff to the controller;
- the `./client` half: `RemoteStreamMuxClient`, `ClientUplinkQueue`, and
  `RemoteStreamCarrierError`.

What it does not own:
- session commands, follow ordering, or history paging — those live in
  `@openai-harness/session-controller`;
- session state, storage, or the buses — the controller injects its own host
  services;
- authentication and admission — the Connection service admits the Peer;
- workspace provisioning, tenant resolution, or Remote Event (`$events`)
  forwarding;
- the browser supervisor above the mux client.

Source references:
- `packages/api/gateway/src/stream-server.ts` and `src/index.ts` in the
  reference deepseek-harness repository
- `src/client/stream-client.ts` (exported as `./client`)
- session follow semantics from this repository's previous subscription
  manager

The mux and the `/api` interceptor are created inside `ctx.effect`, so
unloading the service closes the socket server and removes both registrations.
