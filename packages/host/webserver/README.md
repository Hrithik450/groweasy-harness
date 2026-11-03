# @openai-harness/host-webserver

Cordis service `webServer`: named HTTP routes (`exact` or longest-prefix) and
exact-path HTTP upgrade routes over `node:http`, with listener bind and
disposal.

What it owns:
- the `WebServer` service and its host and port configuration;
- `register` and `registerUpgrade`, duplicate-route rejection, exact-then-
  longest-prefix matching, and upgraded-socket tracking;
- listener bind in `Service.init` and disposal of the server and every upgraded
  socket;
- rejection of wildcard bind addresses before the listener starts.

What it does not own:
- static-dist serving, the SPA fallback, index injection, gzip compression,
  TLS material loading, or `appReady` gating — this gateway does not serve
  files;
- route handlers; owners register them and own the response lifecycle.

Source reference: `packages/host/webserver/src/index.ts` in the reference
deepseek-harness repository. The `ipaddr.js` literal parser is replaced by a
`node:net` check.
