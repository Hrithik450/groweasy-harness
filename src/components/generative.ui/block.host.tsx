"use client";

/**
 * The one place a UI-block spec becomes a mounted block.
 *
 * Owning the renderer wiring here — scope identity, draft values, submission —
 * keeps every call site to a spec and a session, instead of each one
 * re-deriving `scopeId`, `onValueChange` and `onActionComplete`.
 *
 * @module @/components/generative.ui/block.host
 */

import type { UIBlockSpec } from "@/lib/generative.ui";
import { useBlockAnswer } from "@/hooks/use.block.answer";
import { GenerativeUIRenderer } from "./renderer";

export interface BlockHostProps {
  /** Session that receives the answer. */
  sessionId: string;
  /** Durable message the block was rendered in; the id fallback for old blocks. */
  messageId: string;
  spec: UIBlockSpec;
  isStreaming?: boolean;
}

/** Stable identity of a rendered block: its own id, or the legacy pair. */
function blockIdOf(messageId: string, spec: UIBlockSpec): string {
  return typeof spec.id === "string" && spec.id.length > 0
    ? spec.id
    : `${messageId}:${spec.root}`;
}

export function BlockHost({
  sessionId,
  messageId,
  spec,
  isStreaming = false,
}: BlockHostProps) {
  const answerBlock = useBlockAnswer(sessionId);
  const blockId = blockIdOf(messageId, spec);

  return (
    <GenerativeUIRenderer
      scopeId={blockId}
      spec={spec}
      isStreaming={isStreaming}
      onActionComplete={(state) => {
        const values =
          (state?.values as Record<string, unknown> | undefined) ?? state;
        return answerBlock(blockId, values ?? {});
      }}
    />
  );
}
