"use client";

/**
 * Assistant-message chat node.
 *
 * Renders one settled answer: text through the app's Markdown element map and
 * interactive blocks through the shared Generative UI renderer.
 *
 * @module @openai-harness/client-ui-chat/client/AssistantMessageNode
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GenerativeUIRenderer } from "@openai-harness/client-ui-generative/client";
import type { GenerativeUIRendererProps } from "@openai-harness/client-ui-generative/client";
import type { ChatNodeOwnerProps } from "./types";
import { markdownComponents } from "./markdown";

/**
 * Render one assistant answer.
 * @param props - the owning turn plus the bound assistant-node owner props.
 * @returns the answer blocks, or null when the turn has no settled answer.
 */
export function AssistantMessageNode({
  turn,
  isStreamingTurn,
  isLatestTurn = true,
  onActionComplete,
  onBlockValueChange,
}: ChatNodeOwnerProps) {
  const answer = turn.finalAnswer;
  if (answer === undefined) return null;

  return (
    <div className="flex flex-col gap-3 w-full min-w-0">
      {answer.content.map((block, index) => {
        if (block.type === "text") {
          return (
            <div
              key={`text-${index}`}
              className="prose prose-sm max-w-none min-w-0 break-words [overflow-wrap:anywhere] text-foreground"
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {block.text}
              </ReactMarkdown>
            </div>
          );
        }

        if (block.type === "block") {
          const handleAction: NonNullable<
            GenerativeUIRendererProps["onActionComplete"]
          > = (actionState) => {
            if (!block.id) return;
            const values =
              (actionState?.values as Record<string, unknown>) ?? actionState;
            return onActionComplete?.(answer.id, block.id, {
              ...block.spec,
              submitted: true,
              values,
            });
          };

          const ownerProps = {
            spec: block.spec,
            scopeId: answer.id,
            isStreaming: isStreamingTurn,
            // Past turns are history: their blocks close like answered ones.
            isLocked: !isLatestTurn,
            onValueChange: (fieldId: string, value: unknown) =>
              onBlockValueChange?.(answer.id, fieldId, value),
            onActionComplete: handleAction,
          };

          return (
            <div
              key={`block-${index}`}
              className="w-full max-w-full min-w-0"
            >
              <GenerativeUIRenderer {...ownerProps} />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
