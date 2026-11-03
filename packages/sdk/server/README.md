# @openai-harness/sdk-jsonrpc-server

Stdio JSON-RPC 2.0 transport only.

- Reads newline-delimited requests from an input stream (default `stdin`).
- Writes responses to an output stream (default `stdout`).
- Exposes `onRequest(handler)` for the host to route methods.
- Owns no session commands and imports no `@/lib` modules.

Nothing in this repository currently loads the plugin. The browser-facing
gateway uses the Connection carrier and the Remote stream mux; this transport
is kept minimal for a future out-of-process SDK host.

Stdout is reserved for protocol frames, so this plugin must not be loaded with
a stdout logger.
