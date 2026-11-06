import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageId } from "@openai-harness/llm";
import type {
  Message,
  ModelFrame,
  ModelToolSchema,
} from "@openai-harness/llm";
import {
  chatCompletionDoneFrame,
  streamChatCompletionFrames,
  toChatCompletionRequest,
  toChatMessages,
  toChatTools,
  translateChatCompletionChunk,
  type ChatCompletionChunk,
} from "../src/chat-completions";

const lookupTool: ModelToolSchema = {
  type: "function",
  name: "lookup",
  description: "Look something up",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

const textBlock = (text: string) => [{ type: "text" as const, text }];

test("toChatMessages maps an assistant message with tool calls", () => {
  const messages: Message[] = [
    {
      id: MessageId("assistant-1"),
      role: "assistant",
      content: [
        {
          type: "tool-call",
          id: "call_1",
          name: "lookup",
          arguments: '{"query":"x"}',
        },
      ],
    },
  ];

  assert.deepEqual(toChatMessages(messages), [
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "lookup", arguments: '{"query":"x"}' },
        },
      ],
    },
  ]);
});

test("toChatMessages omits tool_calls for a plain assistant message", () => {
  const [message] = toChatMessages([
    {
      id: MessageId("assistant-2"),
      role: "assistant",
      content: textBlock("hi"),
    },
  ]);

  assert.deepEqual(message, { role: "assistant", content: "hi" });
  assert.equal("tool_calls" in message, false);
});

test("toChatMessages maps a tool result message", () => {
  const [message] = toChatMessages([
    {
      role: "tool",
      toolCallId: "call_1",
      content: textBlock('{"ok":true}'),
    },
  ]);

  assert.deepEqual(message, {
    role: "tool",
    tool_call_id: "call_1",
    content: '{"ok":true}',
  });
});

test("toChatMessages maps system and user messages", () => {
  assert.deepEqual(
    toChatMessages([
      { role: "system", content: "be useful" },
      {
        id: MessageId("user-1"),
        role: "user",
        content: textBlock("hello"),
      },
    ]),
    [
      { role: "system", content: "be useful" },
      { role: "user", content: "hello" },
    ],
  );
});

test("toChatTools maps canonical schemas to function tools", () => {
  assert.deepEqual(toChatTools([lookupTool]), [
    {
      type: "function",
      function: {
        name: "lookup",
        description: "Look something up",
        parameters: lookupTool.parameters,
      },
    },
  ]);
});

test("toChatCompletionRequest omits tools when the tool list is empty", () => {
  const request = toChatCompletionRequest({
    model: "test-model",
    messages: [
      {
        id: MessageId("request-user"),
        role: "user",
        content: textBlock("hi"),
      },
    ],
    tools: [],
  });

  assert.equal("tools" in request, false);
  assert.equal("tool_choice" in request, false);
  assert.equal(request.stream, true);
  assert.deepEqual(request.stream_options, { include_usage: true });
});

test("toChatCompletionRequest includes tools and auto choice when present", () => {
  const request = toChatCompletionRequest({
    model: "test-model",
    messages: [
      {
        id: MessageId("request-user"),
        role: "user",
        content: textBlock("hi"),
      },
    ],
    tools: [lookupTool],
  });

  assert.deepEqual(request.tools, toChatTools([lookupTool]));
  assert.equal(request.tool_choice, "auto");
});

test("translateChatCompletionChunk emits text deltas", () => {
  const result = translateChatCompletionChunk({
    choices: [{ delta: { content: "Hel" }, finish_reason: null }],
  });

  assert.deepEqual(result.frames, [{ type: "text-delta", delta: "Hel" }]);
  assert.equal(result.finishReason, null);
});

test("translateChatCompletionChunk accepts reasoning_content from DeepSeek", () => {
  const result = translateChatCompletionChunk({
    choices: [
      {
        delta: { reasoning_content: "thinking" },
        finish_reason: null,
      },
    ],
  });

  assert.deepEqual(result.frames, [
    { type: "reasoning-delta", delta: "thinking" },
  ]);
});

test("translateChatCompletionChunk prefers reasoning over reasoning_content", () => {
  const result = translateChatCompletionChunk({
    choices: [
      {
        delta: { reasoning: "first", reasoning_content: "second" },
        finish_reason: null,
      },
    ],
  });

  assert.deepEqual(result.frames, [
    { type: "reasoning-delta", delta: "first" },
  ]);
});

test("translateChatCompletionChunk maps tool-call deltas", () => {
  const result = translateChatCompletionChunk({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              function: { name: "lookup", arguments: '{"q"' },
            },
            { index: 1, function: { arguments: "{}" } },
          ],
        },
        finish_reason: null,
      },
    ],
  });

  assert.deepEqual(result.frames, [
    {
      type: "tool-call-delta",
      index: 0,
      id: "call_1",
      name: "lookup",
      argumentsDelta: '{"q"',
    },
    { type: "tool-call-delta", index: 1, argumentsDelta: "{}" },
  ]);
});

test("translateChatCompletionChunk maps usage on a choice-less chunk", () => {
  const result = translateChatCompletionChunk({
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    choices: [],
  });

  assert.deepEqual(result.frames, [
    {
      type: "usage",
      usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
    },
  ]);
});

test("translateChatCompletionChunk threads the finish reason forward", () => {
  const first = translateChatCompletionChunk({
    choices: [{ delta: {}, finish_reason: "tool_calls" }],
  });
  const second = translateChatCompletionChunk(
    { choices: [] },
    first.finishReason,
  );

  assert.equal(first.finishReason, "tool_calls");
  assert.equal(second.finishReason, "tool_calls");
});

test("chatCompletionDoneFrame reports the finish reason", () => {
  assert.deepEqual(chatCompletionDoneFrame("stop"), {
    type: "done",
    finishReason: "stop",
  });
  assert.deepEqual(chatCompletionDoneFrame(null), {
    type: "done",
    finishReason: null,
  });
});

test("streamChatCompletionFrames translates a full stream in order", async () => {
  const chunks: ChatCompletionChunk[] = [
    { choices: [{ delta: { reasoning_content: "why" } }] },
    { choices: [{ delta: { content: "hi" } }] },
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                function: { name: "lookup", arguments: "{}" },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    },
    {
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      choices: [],
    },
  ];

  async function* source(): AsyncIterable<ChatCompletionChunk> {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  const frames: ModelFrame[] = [];
  for await (const frame of streamChatCompletionFrames(source())) {
    frames.push(frame);
  }

  assert.deepEqual(frames, [
    { type: "reasoning-delta", delta: "why" },
    { type: "text-delta", delta: "hi" },
    {
      type: "tool-call-delta",
      index: 0,
      id: "call_1",
      name: "lookup",
      argumentsDelta: "{}",
    },
    {
      type: "usage",
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    },
    { type: "done", finishReason: "tool_calls" },
  ]);
});
