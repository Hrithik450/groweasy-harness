/**
 * Shared Chat Completions wire mapping.
 *
 * OpenAI and DeepSeek both speak this protocol, so the vocabulary, the request
 * serializer, the content projection, and the stream translator are shared by
 * every Chat-Completions-backed driver and split by concern:
 *
 * - `wire-types`  the provider's structural shapes
 * - `content`     canonical blocks → wire values
 * - `serialize`   messages and tools → one request body
 * - `translate`   stream chunks → normalized frames
 *
 * @module @/lib/llm/llm/chat-completions
 */

export * from "./content";
export * from "./serialize";
export * from "./translate";
export * from "./wire-types";
