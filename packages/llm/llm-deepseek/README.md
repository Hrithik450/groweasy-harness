# @openai-harness/llm-deepseek

DeepSeek provider adapter: one `ModelDriver` that speaks the OpenAI-compatible
Chat Completions wire format, plus the Cordis plugin that registers the
`deepseek` provider route.

What it owns:
- `DeepSeekAdapter` and the `createDeepSeekChatDriver` factory, plus the
  process-wide `deepSeekChatDriver`;
- `DeepSeekConfig` and `resolveDeepSeekOptions` in `config.ts`, which read the
  API key, base URL, and model id from config then environment, plus the
  schemastery `Config` for plugin loading;
- `createDeepSeekClient` / `getDeepSeekClient` in `client.ts`, caching one SDK
  client per API key and endpoint;
- `registerDeepSeekProvider`, the Cordis service `DeepSeekProvider`, and the
  `DEEPSEEK_PROVIDER` route id.

What it does not own:
- Chat Completions wire mapping and frame translation: those live in
  `@openai-harness/llm-openai` and are shared by every OpenAI-compatible
  provider;
- attachment storage: the host supplies a `LoadRequestImage` callback;
- provider-neutral message and driver types: those live in
  `@openai-harness/llm`;
- turns, retries, or token accounting: the agent loop owns those.

Source reference: `packages/llm/llm-deepseek-api-key` and
`packages/llm/llm-deepseek` in the reference deepseek-harness repository. As
there, this package owns the provider's transport, configuration, and route
registration; the runtime registry stays in `@openai-harness/llm`.
