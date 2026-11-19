/**
 * The assistant reply remembers why its turn started.
 *
 * Declared as augmentation so the loop can annotate a reply without changing
 * the LLM package's message types.
 *
 * @module @/lib/core/agent/assistant.source
 */

import type { ModelMessageSource } from "@/lib/llm/llm/message";

declare module "@/lib/llm/llm/message" {
  interface ModelMessageSource {
    turnKind?: string;
  }
}

/** Originating turn source kind recorded on an assistant reply. */
export function assistantTurnSource(
  source: ModelMessageSource | undefined,
): string | undefined {
  const legacy = (source as { turn?: unknown } | undefined)?.turn;
  return source?.turnKind ?? (typeof legacy === "string" ? legacy : undefined);
}
