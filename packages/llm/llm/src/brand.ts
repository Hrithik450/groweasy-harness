/**
 * Duplicate-install-safe nominal identifiers for the model-call boundary.
 *
 * These brands make structurally identical strings non-interchangeable at the
 * type level: a MessageId cannot be passed where a ToolCallId is expected.
 * Comparison, logging, and serialization retain the underlying primitive
 * behavior.
 *
 * @module @/lib/llm/brand
 */

import { brandString, type Branded } from "@openai-harness/brand";

/** Stable identity carried by one message across inbox, log, and model-request boundaries. */
export type MessageId = Branded<"MessageId">;

/**
 * Brand a message identifier.
 * @param id - the opaque message identifier.
 * @returns the same string with the message-id brand.
 */
export function MessageId(id: string): MessageId {
  return brandString<MessageId>(id);
}

/**
 * Correlates a model-issued tool call with its result. Provider-issued for
 * real adapters; synthesized by mocks/assembler fallbacks.
 */
export type ToolCallId = Branded<"ToolCallId">;

/**
 * Brand a string as a {@link ToolCallId}.
 * @param id - the provider-issued or synthesized call id.
 * @returns the same string with the tool-call-id brand.
 */
export function ToolCallId(id: string): ToolCallId {
  return brandString<ToolCallId>(id);
}

/** Provider-issued request identifier retained for diagnostics across package boundaries. */
export type ProviderRequestId = Branded<"ProviderRequestId">;

/**
 * Brand a provider-issued request identifier.
 * @param id - the opaque provider-issued string.
 * @returns the same string with the provider-request-id brand.
 */
export function ProviderRequestId(id: string): ProviderRequestId {
  return brandString<ProviderRequestId>(id);
}

/** Identity of one model streaming attempt, unique within one Agent lifecycle. */
export type LlmAttemptId = Branded<"LlmAttemptId">;

/**
 * Brand one loop-owned streaming attempt identifier.
 * @param id - the opaque Agent-lifecycle-local identifier.
 * @returns the same string with the attempt-id brand.
 */
export function LlmAttemptId(id: string): LlmAttemptId {
  return brandString<LlmAttemptId>(id);
}

/** Adapter-owned identifier for one model's selectable reasoning effort. */
export type ReasoningEffortId = Branded<"ReasoningEffortId">;

/**
 * Brand an adapter-owned reasoning-effort identifier.
 * @param id - the opaque identifier exposed by one model capability.
 * @returns the same string with the reasoning-effort-id brand.
 */
export function ReasoningEffortId(id: string): ReasoningEffortId {
  return brandString<ReasoningEffortId>(id);
}
