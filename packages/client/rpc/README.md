# @openai-harness/client-rpc

Framework-free browser transport client for the agent gateway.

What it owns:
- `.../src/client.ts` — `RpcClient`: typed unary calls over
  `POST /api/<namespace>/<method>`, plus one `session.follow` subscription over
  the Gateway Remote stream mux (`/api/remote.mux`) with an internal reopen
  loop (exponential backoff, fresh mux per generation, `afterSeq` advanced
  from the accepted snapshot cursor or event sequence);
- `RpcClientError`, `RpcSubscription`, and the socket/fetch seams used by
  tests (`RpcSocket`, `RpcSocketFactory`, `RpcClientOptions.fetch`).

What it does not own:
- application configuration — callers pass `options.url`; the Next.js
  application reads `NEXT_PUBLIC_GATEWAY_URL` in `src/lib/rpc/client.ts` and
  injects it;
- the process-wide browser singleton (`getRpcClient()`) — that stays in the
  application shim so HMR and deployment configuration remain app concerns;
- the wire contract — method names, params, results, and follow frames come
  from `@openai-harness/sdk-protocol`;
- the unary envelope and the physical mux socket — those come from
  `@openai-harness/client-connection/client` and
  `@openai-harness/api-gateway/client`.

No module in this package reads `process.env`, imports Next.js, or imports the
application's `@/lib` sources.
