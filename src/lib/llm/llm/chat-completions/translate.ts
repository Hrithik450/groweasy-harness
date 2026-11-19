/**
 * Chat Completions stream chunks translated into normalized model frames.
 *
 * @module @/lib/llm/llm/chat-completions/translate
 */

import type { ModelFrame } from "@/lib/llm/llm/driver";
import type {
  ChatCompletionChunk,
  ChatCompletionDelta,
  ChatCompletionDeltaToolCall,
} from "./wire-types";

export interface ChatCompletionTranslation {
  frames: ModelFrame[];
  finishReason: string | null;
}

/**
 * Translate one Chat Completion chunk into normalized frames.
 *
 * `finishReason` threads through chunks because providers may report an empty
 * `choices` array (usage-only chunk) after the choice that carried the reason.
 */
export function translateChatCompletionChunk(
  chunk: ChatCompletionChunk,
  finishReason: string | null = null,
): ChatCompletionTranslation {
  const frames: ModelFrame[] = [];
  let nextFinishReason = finishReason;

  if (chunk.usage) {
    frames.push({
      type: "usage",
      usage: {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens,
      },
    });
  }

  for (const choice of chunk.choices) {
    const delta = choice.delta;

    if (delta.content) {
      frames.push({ type: "text-delta", delta: delta.content });
    }

    const reasoning = delta.reasoning ?? delta.reasoning_content;
    if (reasoning) {
      frames.push({ type: "reasoning-delta", delta: reasoning });
    }

    for (const call of delta.tool_calls ?? []) {
      frames.push({
        type: "tool-call-delta",
        index: call.index,
        ...(call.id !== undefined ? { id: call.id } : {}),
        ...(call.function?.name !== undefined
          ? { name: call.function.name }
          : {}),
        ...(call.function?.arguments !== undefined
          ? { argumentsDelta: call.function.arguments }
          : {}),
      });
    }

    if (choice.finish_reason) {
      nextFinishReason = choice.finish_reason;
    }
  }

  return { frames, finishReason: nextFinishReason };
}

/** Build the terminal frame for a completed stream. */
export function chatCompletionDoneFrame(
  finishReason: string | null,
): ModelFrame {
  return { type: "done", finishReason };
}

/**
 * Translate a whole Chat Completions stream into normalized frames.
 *
 * The final `done` frame is emitted once, after the provider stream ends, using
 * the last finish reason observed.
 */
export async function* streamChatCompletionFrames(
  stream: AsyncIterable<ChatCompletionChunk>,
): AsyncGenerator<ModelFrame> {
  let finishReason: string | null = null;

  for await (const chunk of stream) {
    const translation = translateChatCompletionChunk(chunk, finishReason);
    finishReason = translation.finishReason;
    for (const frame of translation.frames) {
      yield frame;
    }
  }

  yield chatCompletionDoneFrame(finishReason);
}

