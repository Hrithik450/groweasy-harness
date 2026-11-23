/**
 * Client-side chat-node derivation: durable events plus the live preview.
 *
 * `events` is the only state the chat store keeps; nodes are computed from it
 * on read. The live text is the one thing that is *not* durable, so it is
 * layered on top here and nowhere else.
 *
 * @module @/store/derive.nodes
 */

import type { AssistantStepChatNode, ChatNode } from "@/components/chat/nodes";
import type { SessionEvent } from "@/lib/core/session/events";
import { deriveChatNodes } from "@/lib/session/derive/nodes";
import type { ContentBlock } from "@/lib/llm/llm/message";

/** One assistant attempt being streamed in this process. */
export interface LiveAssistantStream {
  attemptId: string;
  turn: number;
  step: number;
  startedAfterSeq: number;
  text: string;
}

/** Merge text without doubling a shared newline boundary. */
function mergeText(current: string, delta: string): string {
  if (current.endsWith("\n\n") && delta.startsWith("\n\n")) {
    return current + delta.replace(/^\n\n+/, "");
  }
  if (current.endsWith("\n") && delta.startsWith("\n")) {
    return current + delta.replace(/^\n+/, "\n");
  }
  return current + delta;
}

function appendLiveText(
  content: readonly ContentBlock[],
  text: string,
): ContentBlock[] {
  const last = content[content.length - 1];
  if (last?.type === "text") {
    return [
      ...content.slice(0, -1),
      { type: "text", text: mergeText(last.text, text) },
    ];
  }
  return [...content, { type: "text", text }];
}

/** Layer uncommitted stream text onto the assistant step it belongs to. */
export function overlayLiveNodes(
  nodes: readonly ChatNode[],
  live: LiveAssistantStream | undefined,
): ChatNode[] {
  if (!live || live.text.length === 0) return [...nodes];

  let target = -1;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (
      node.kind === "assistant-step" &&
      node.turn === live.turn &&
      node.step === live.step
    ) {
      target = index;
      break;
    }
  }

  if (target >= 0) {
    const node = nodes[target] as AssistantStepChatNode;
    const next = [...nodes];
    next[target] = {
      ...node,
      content: appendLiveText(node.content, live.text),
    };
    return next;
  }

  const lastSeq = nodes.reduce((max, node) => Math.max(max, node.seq), 0);
  const synthetic: AssistantStepChatNode = {
    kind: "assistant-step",
    seq: lastSeq + 1,
    turn: live.turn,
    step: live.step,
    content: [{ type: "text", text: live.text }],
  };
  return [...nodes, synthetic];
}

/** Derive the node stream from durable events, then layer live text on top. */
export function deriveNodes(
  sessionId: string,
  events: readonly SessionEvent[],
  live: LiveAssistantStream | undefined,
): ChatNode[] {
  return overlayLiveNodes(deriveChatNodes(events, sessionId), live);
}
