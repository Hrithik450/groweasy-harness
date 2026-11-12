"use client";

/**
 * Chat message-node seat for one Generative UI block.
 *
 * This is the slot entry the package registers: a thin adapter from the chat
 * node's owner props to {@link GenerativeUIRenderer}. The renderer and the
 * component registry below it are unchanged application code.
 *
 * @module @openai-harness/client-ui-generative
 */
import {
  canonicalizeBlockTypes,
  type UIBlockSpec,
} from "@openai-harness/generative-ui";
import {
  GenerativeUIRenderer,
  type GenerativeUIRendererProps,
} from "./renderer";

/** Owner props of the Generative UI chat node slot. */
export interface GenerativeUINodeOwnerProps {
  /** Block spec to render. */
  spec: UIBlockSpec;
  /** Stable scope id for field/value state. */
  scopeId: string;
  /** Whether the owning message is still streaming. */
  isStreaming?: boolean;
  /** Called when the block's submit action fires. */
  onActionComplete?: GenerativeUIRendererProps["onActionComplete"];
  /** Called on every field interaction. */
  onValueChange?: (fieldId: string, value: unknown) => void;
}

/**
 * Render one assistant message's Generative UI block.
 * @param props - spec, scope id, streaming flag, and interaction callbacks.
 * @returns the rendered block.
 */
export function GenerativeUINode({
  spec,
  scopeId,
  isStreaming,
  onActionComplete,
  onValueChange,
}: GenerativeUINodeOwnerProps) {
  return (
    <GenerativeUIRenderer
      // Persisted specs keep the spelling their tool emitted; the registry
      // looks components up by exact name, so normalize before rendering.
      spec={canonicalizeBlockTypes(spec)}
      scopeId={scopeId}
      isStreaming={isStreaming}
      onActionComplete={onActionComplete}
      onValueChange={onValueChange}
    />
  );
}
