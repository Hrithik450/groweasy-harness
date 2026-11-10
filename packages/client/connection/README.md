# @openai-harness/client-connection

Connection wire contracts, the shared Peer scope, the node:http ↔ Fetch
bridge, and the browser unary RPC caller.

What it owns:
- `.../src/rpc.ts` (envelope types, validation, endpoint translation,
  `RpcPeer` and the Fetch-handler contracts);
- `.../src/http-bridge.ts` (node:http ↔ Fetch bridge shared with the host
  carrier);
- `.../src/peer.ts` (Peer scope);
- `.../src/rpc-host.ts` (the node half: authenticated `/api` HTTP route,
  admission fence, `HostConnectionService`);
- `.../src/browser-auth.ts` (the `BrowserAuth` seam the host half admits with);
- `.../src/client/rpc.ts` (browser unary caller, exported as `./client`).

What it does not own: which user a cookie belongs to — that answer comes from
the host application through the `BrowserAuth` service.

Adaptations inherited from the reference port: Peer scopes use a Cordis child
fiber instead of `@deepseek-ai/dsh-scope`, so `Peer.create` is asynchronous.
Attachments, exact Fetch routes, connect/launch-token flows, and the request
waterfall are omitted.
