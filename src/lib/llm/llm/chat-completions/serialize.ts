/**
 * Canonical messages and tool schemas serialized into a Chat Completions
 * request body.
 *
 * @module @/lib/llm/llm/chat-completions/serialize
 */

import type {
  ModelMessage,
  ModelToolSchema,
} from "@/lib/llm/llm/driver";
import type { ContentBlock, Message, ToolCallBlock } from "@/lib/llm/llm/message";
import type { EncodedImageMap } from "@/lib/llm/llm-openai/images";
import {
  blocksToText,
  textWithoutEncodedImages,
  imageContentParts,
  toolCallsFrom,
  toolResultImageEnvelope,
} from "./content";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessage,
  ChatCompletionRequest,
  ChatCompletionRequestInput,
  ChatCompletionTool,
} from "./wire-types";

function toChatMessage(
  message: Message,
  encodedImages?: EncodedImageMap,
): ChatCompletionMessage[] {
  switch (message.role) {
    case "system": {
      const content =
        typeof message.content === "string"
          ? message.content
          : blocksToText(message.content);
      return [{ role: "system", content }];
    }
    case "user": {
      const text = textWithoutEncodedImages(message.content, encodedImages);
      const images = imageContentParts(message.content, encodedImages);
      if (images.length === 0) {
        return [{ role: "user", content: text }];
      }
      const parts: ChatCompletionContentPart[] = [];
      if (text.length > 0) parts.push({ type: "text", text });
      parts.push(...images);
      return [{ role: "user", content: parts }];
    }
    case "assistant": {
      // Assistant images are never replayed.
      const content = blocksToText(message.content);
      const toolCalls = toolCallsFrom(message.content);
      if (toolCalls.length === 0) {
        return [{ role: "assistant", content }];
      }
      return [
        {
          role: "assistant",
          content: content.length > 0 ? content : null,
          tool_calls: toolCalls,
        },
      ];
    }
    case "tool": {
      const blocks =
        typeof message.content === "string"
          ? [{ type: "text" as const, text: message.content }]
          : message.content;
      const content = textWithoutEncodedImages(blocks, encodedImages);
      const images = imageContentParts(blocks, encodedImages);

      const toolMessage: ChatCompletionMessage = {
        role: "tool",
        tool_call_id: String(message.toolCallId),
        content,
      };

      if (images.length === 0) return [toolMessage];

      // A tool-role message must stay a string on this API. Carry the images
      // in an adjacent user message instead.
      const parts: ChatCompletionContentPart[] = [
        {
          type: "text",
          text: toolResultImageEnvelope(
            String(message.toolCallId),
            images.length,
          ),
        },
        ...images,
      ];
      return [toolMessage, { role: "user", content: parts }];
    }
  }
}

/** Map canonical messages to Chat Completions messages. */
export function toChatMessages(
  messages: readonly Message[],
  encodedImages?: EncodedImageMap,
): ChatCompletionMessage[] {
  return messages.flatMap((message) => toChatMessage(message, encodedImages));
}

/** Map one canonical function schema to a Chat Completions tool. */
function toChatTool(tool: ModelToolSchema): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

/** Map canonical function schemas to Chat Completions tools. */
export function toChatTools(
  tools: readonly ModelToolSchema[],
): ChatCompletionTool[] {
  return tools.map(toChatTool);
}

/** Map one provider-neutral driver message to its Chat Completions wire form. */
function toChatMessageFromModel(
  message: ModelMessage,
): ChatCompletionMessage[] {
  switch (message.role) {
    case "system":
      return [{ role: "system", content: message.content ?? "" }];
    case "user":
      return [{ role: "user", content: message.content ?? "" }];
    case "assistant": {
      const toolCalls = (message.toolCalls ?? []).map((call) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.arguments },
      }));
      return [
        {
          role: "assistant",
          content: message.content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
      ];
    }
    case "tool":
      return [
        {
          role: "tool",
          tool_call_id: message.toolCallId ?? "",
          content: message.content ?? "",
        },
      ];
  }
}

/**
 * Build the shared streaming request body.
 *
 * Tool fields are omitted entirely when there are no tools, matching the
 * providers' preference for an absent `tools` key over an empty array.
 */
export function toChatCompletionRequest(
  input: ChatCompletionRequestInput,
): ChatCompletionRequest {
  const tools = toChatTools(input.tools ?? []);
  return {
    model: input.model,
    messages: input.messages.flatMap(toChatMessageFromModel),
    ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    stream: true,
    stream_options: { include_usage: true },
  };
}

/** Result of translating one streamed chunk. */
