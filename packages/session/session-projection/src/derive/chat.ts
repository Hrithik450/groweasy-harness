/**
 * Pure derivation of the canonical model-visible conversation from the durable
 * session event log.
 *
 * Checkpoint ranges are hidden and replaced in place by their summary message.
 * Hidden tool-result snapshots on the user surface are skipped because the
 * corresponding `tool/result` event maps them to a tool-role message exactly
 * once. Prune replacements are applied to their cited tool results.
 *
 * @module @openai-harness/session-projection/derive/chat
 */

import type { SessionEvent } from "@openai-harness/session";
import { projectCompaction } from "@openai-harness/compaction-basic";
import { MessageId } from "@openai-harness/llm";
import type { Message } from "@openai-harness/llm";

/**
 * Derive the full model-visible conversation from session events.
 *
 * System instructions lead. Checkpoint ranges are hidden and replaced in place
 * by their summary message.
 */
export function toChatMessages(
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
