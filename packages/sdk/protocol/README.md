# @openai-harness/sdk-protocol

Wire values shared by the browser, gateway, and session service: the session
RPC method names, parameter schemas, request and result types, the
`SessionFollowFrame` union, the Remote stream frames and their strict parsers,
and the Remote failure vocabulary.

What it owns:
- `RPC_METHODS`, `RpcMethod`, `RpcRequestMap`, `rpcParamSchemas`, and
  `subscriptionParamsSchemas`;
- prompt, cancel, page, and follow contracts, including `SessionFollowFrame`
  and the assistant-stream baseline and frame types;
- `REMOTE_STREAM_MUX_PATH`, the client and server Remote stream messages, and
  `parseRemoteStreamClientMessage` / `parseRemoteStreamServerMessage`;
- `RemoteError`, `TypertGatewayError`, `remoteErrorOf`, and the gateway failure
  codes.

What it does not own:
- the gateway dispatch, mux, or follow-stream implementation;
- the session service that answers these methods;
- the browser client that speaks this protocol;
- Remote Event (`$events`) forwarding, which is not part of this port.

Source references:
- `src/lib/rpc/contracts.ts` (this repository's domain contract)
- `packages/api/gateway/src/stream-protocol.ts` in the reference repository
- `packages/typert/protocol/src/{remote-error.ts,json-value.ts}`

The imports from `@openai-harness/session` and
`@openai-harness/generative-ui` are type-only and erased before runtime, so
this package stays framework-free.
