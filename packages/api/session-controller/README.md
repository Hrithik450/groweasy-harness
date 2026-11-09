# @openai-harness/session-controller

The Session RPC surface: `list`, `inspect`, `create`, `update`, `prompt`,
`page`, `cancel`, the `block.submit` extension, and the live `follow` stream.

This package mirrors `packages/api/session-controller` in the reference
deepseek-harness repository:

- `SessionController` is a Cordis Service registered as `sessionController`
  and injected by the Gateway through `static inject`.
- Session CRUD comes from `@openai-harness/session-persistence`; this package
  imports no application aliases.
- Durable storage, the committed-event bus, and the assistant-frame bus arrive
  through the injected `sessionFollow` service.
- The agent turn and block-submission text arrive through the injected
  `sessionAgent` service. The host binds the application workflow there, so
  this package never imports app code.
- Follow ordering (`openSessionFollow`) and turn-aligned paging
  (`pageSessionEvents`) live here, next to the Session commands that use them.

The Gateway owns only wire dispatch and the stream mux; it forwards each
`session.*` method to this service.
