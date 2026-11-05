/**
 * Projection-aware fallback derivation of the model-visible conversation from
 * a selected event span.
 *
 * The application binds its full session derivation through
 * {@link CompactionHostBindings.deriveMessages}; this module keeps the strategy
 * usable and testable without a host. Checkpoint ranges are hidden and
 * replaced in place by their summary message, and prune replacements are
 * applied to their cited tool results.
 *
 * @module @openai-harness/compaction-basic/derive
 */

import { MessageId } from "@openai-harness/llm";
import type { Message } from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";

import { projectCompaction } from "./region";

/**
 * Derive the model-visible conversation from a selected span of events.
 *
 * @param events - selected durable events in log order.
 * @param instructions - optional leading system instructions.
 * @returns canonical messages in surface order.
 */
export function deriveMessages(
  events: readonly SessionEvent[],
  instructions?: string,
): Message[] {
  const messages: Message[] = [];
  const projection = projectCompaction(events);
  const emittedCheckpoints = new Set<string>();
  const system = instructions?.trim();
  if (system) {
    messages.push({ role: "system", content: system });
  }

  for (const event of events) {
    const checkpoint = projection.checkpointAtStart.get(event.seq);
    if (checkpoint?.messageContent !== undefined) {
      if (checkpoint.messageContent.length > 0) {
        messages.push({
          id: MessageId(`compact-checkpoint:${checkpoint.compactionId}`),
          role: "user",
          content: [...checkpoint.messageContent],
          source: {
            kind: "compact-checkpoint",
            compactionId: checkpoint.compactionId,
          },
        });
      }
      emittedCheckpoints.add(checkpoint.compactionId);
    }
    if (projection.shadowedSeqs.has(event.seq)) continue;

    switch (event.type) {
      case "user/message": {
        const message = event.data;
        if (message.source?.kind === "compact-checkpoint") {
          const checkpointId = message.source.compactionId;
          if (
            typeof checkpointId === "string" &&
            !projection.supersededCheckpointIds.has(checkpointId) &&
            !emittedCheckpoints.has(checkpointId)
          ) {
            if (message.content.length > 0) {
              messages.push(message);
            }
            emittedCheckpoints.add(checkpointId);
          }
          break;
        }
        // Tool-result snapshots map to the tool-role message appended below.
        if (message.source?.kind === "tool-result") break;
        if (message.content.length > 0) {
          messages.push(message);
        }
        break;
      }

      case "assistant/message": {
        const message = event.data.message;
        if (message.content.length > 0) {
          messages.push(message);
        }
        break;
      }

      case "system/message": {
        messages.push(event.data);
        break;
      }

      case "tool/result": {
        const message = event.data.message;
        const pruned = projection.pruneBySeq.get(event.seq);
        const content = pruned ? [...pruned] : message.content;
        messages.push({ ...message, content });
        break;
      }
    }
  }

  return messages;
}
