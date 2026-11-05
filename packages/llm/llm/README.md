# @openai-harness/llm

Provider-neutral model vocabulary: message and tool-call identities,
conversation messages with their content blocks, the user-message source map,
and the driver contract that translates canonical messages to one provider's
wire format and streams normalized frames back.

What it owns:
- the `MessageId`, `ToolCallId`, `ProviderRequestId`, `LlmAttemptId`, and
  `ReasoningEffortId` brands;
- `Message`, `UserMessage`, `AssistantMessage`, `SystemMessage`,
  `ToolResultMessage`, `ContentBlock`, `MessageSourceMap`, and `TokenUsage`;
- `ModelDriver`, `ModelStreamInput`, `ModelFrame`, `ModelToolSchema`, and
  `ModelUsage`;
- `ModelDriverRegistry` with provider normalization, default-model lookup, and
  per-variant driver caching, plus the process-wide `modelDriverRegistry` and
  the Cordis `llm` service.

What it does not own:
- provider adapters or any concrete wire translation — implementations live in
  `@openai-harness/llm-openai` and `@openai-harness/llm-deepseek`;
- turns, steps, retries, or durable events — the agent loop owns those;
- session-log persistence and tokenization.

Source references: the `brand` and `message` modules of `packages/llm/llm` in
the reference deepseek-harness repository. The `driver` module is this
harness's provider-neutral streaming contract.
