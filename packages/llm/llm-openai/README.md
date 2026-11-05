# @openai-harness/llm-openai

OpenAI provider adapters: one `ModelDriver` that speaks both the Chat
Completions and Responses wire formats, plus the Cordis plugin that registers
the `openai` provider route.

What it owns:
- `OpenAIAdapter` and the `createOpenAIChatDriver` /
  `createOpenAIResponsesDriver` factories;
- canonical-to-wire mapping for Chat Completions (`toChatMessages`,
  `toChatCompletionRequest`, `translateChatCompletionChunk`) and Responses
  (`toResponsesInput`, `toResponsesRequest`, `ResponsesStreamTranslator`);
- request-image projection (`encodeImages`, `collectImageRefs`) with a
  host-injected loader;
- `OpenAIConfig` and `resolveOpenAIOptions` in `options.ts`, which read model
  ids, API keys, endpoint selection, and reasoning effort from config then
  environment, plus the schemastery `Config` in `config.ts` for plugin loading;
- `OpenAIProvider`, the Cordis service that calls
  `ctx.llm.registerAdapter("openai", ...)` while mounted, and
  `registerOpenAIProvider` for hosts that compose registration directly.

What it does not own:
- attachment storage: the host supplies a `LoadRequestImage` callback;
- provider-neutral message and driver types: those live in
  `@openai-harness/llm`;
- turns, retries, or token accounting: the agent loop owns those.

Source reference: `packages/llm/llm-deepseek` in the reference
deepseek-harness repository. As there, the provider package owns its transport,
configuration, and plugin registration; the runtime registry stays in
`packages/llm/llm`.
