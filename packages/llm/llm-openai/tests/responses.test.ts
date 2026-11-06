import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageId } from "@openai-harness/llm";
import type {
  Message,
  ModelFrame,
  ModelToolSchema,
} from "@openai-harness/llm";
import {
  ResponsesStreamTranslator,
  streamResponsesFrames,
  toResponsesRequest,
  toResponsesTools,
  type ResponsesStreamEvent,
} from "../src/responses";

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

test("toResponsesInput maps system, user, assistant, and tool messages", () => {
  const messages: Message[] = [
    { role: "system", content: "be useful" },
    {
      id: MessageId("user-1"),
      role: "user",
      content: textBlock("hello"),
    },
    {
      id: MessageId("assistant-1"),
      role: "assistant",
      content: [
        { type: "reasoning", reasoning: "not replayed" },
        { type: "text", text: "calling twice" },
        { type: "tool-call", id: "call_1", name: "lookup", arguments: '{"q":"a"}' },
        { type: "tool-call", id: "call_2", name: "lookup", arguments: '{"q":"b"}' },
      ],
    },
    {
      role: "tool",
      toolCallId: "call_1",
      content: textBlock('{"ok":true}'),
    },
  ];

  assert.deepEqual(
    toResponsesRequest({ model: "test-model", messages }).input,
    [
      { role: "system", content: "be useful" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "calling twice" },
      {
        type: "function_call",
        call_id: "call_1",
        name: "lookup",
        arguments: '{"q":"a"}',
      },
      {
        type: "function_call",
        call_id: "call_2",
        name: "lookup",
        arguments: '{"q":"b"}',
      },
      { type: "function_call_output", call_id: "call_1", output: '{"ok":true}' },
    ],
  );
});

test("toResponsesInput omits assistant text when only tool calls are present", () => {
  const input = toResponsesRequest({
    model: "test-model",
    messages: [
      {
        id: MessageId("assistant-tools-only"),
        role: "assistant",
        content: [
          { type: "tool-call", id: "call_1", name: "lookup", arguments: "{}" },
        ],
      },
    ],
  }).input;

  assert.deepEqual(input, [
    { type: "function_call", call_id: "call_1", name: "lookup", arguments: "{}" },
  ]);
});

test("toResponsesInput maps tool results with string content", () => {
  const input = toResponsesRequest({
    model: "test-model",
    messages: [{ role: "tool", toolCallId: "call_9", content: "done" }],
  }).input;

  assert.deepEqual(input, [
    { type: "function_call_output", call_id: "call_9", output: "done" },
  ]);
});

test("toResponsesTools maps schemas to flat function tools with strict false", () => {
  assert.deepEqual(toResponsesTools([lookupTool]), [
    {
      type: "function",
      name: "lookup",
      description: "Look something up",
      parameters: lookupTool.parameters,
      strict: false,
    },
  ]);
});

test("toResponsesRequest includes tools when present and always stores false", () => {
  const request = toResponsesRequest({
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

  assert.deepEqual(request.tools, toResponsesTools([lookupTool]));
  assert.equal(request.store, false);
  assert.equal(request.stream, true);
});

test("toResponsesRequest omits tools when the tool list is empty", () => {
  const request = toResponsesRequest({
    model: "test-model",
    messages: [],
    tools: [],
  });

  assert.equal("tools" in request, false);
});

test("toResponsesRequest includes reasoning only when supplied", () => {
  const without = toResponsesRequest({ model: "test-model", messages: [] });
  assert.equal("reasoning" in without, false);

  const withEffort = toResponsesRequest({
    model: "test-model",
    messages: [],
    reasoningEffort: "high",
  });
  assert.deepEqual(withEffort.reasoning, { effort: "high" });
});

test("translator tracks function-call indices and emits argument deltas", () => {
  const translator = new ResponsesStreamTranslator();

  assert.deepEqual(
    translator.translate({
      type: "response.output_item.added",
      output_index: 2,
      item: {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "lookup",
      },
    }),
    [{ type: "tool-call-delta", index: 2, id: "call_1", name: "lookup" }],
  );

  // Without output_index the tracked item index is used.
  assert.deepEqual(
    translator.translate({
      type: "response.function_call_arguments.delta",
      item_id: "fc_1",
      delta: '{"q"',
    }),
    [{ type: "tool-call-delta", index: 2, argumentsDelta: '{"q"' }],
  );

  // An explicit output_index takes precedence over the tracked value.
  assert.deepEqual(
    translator.translate({
      type: "response.function_call_arguments.delta",
      item_id: "fc_1",
      output_index: 3,
      delta: ":1}",
    }),
    [{ type: "tool-call-delta", index: 3, argumentsDelta: ":1}" }],
  );
});

test("translator maps text and reasoning deltas", () => {
  const translator = new ResponsesStreamTranslator();

  assert.deepEqual(
    translator.translate({
      type: "response.output_text.delta",
      delta: "Hel",
    }),
    [{ type: "text-delta", delta: "Hel" }],
  );
  assert.deepEqual(
    translator.translate({
      type: "response.reasoning_text.delta",
      delta: "thinking",
    }),
    [{ type: "reasoning-delta", delta: "thinking" }],
  );
  assert.deepEqual(
    translator.translate({
      type: "response.reasoning_summary_text.delta",
      delta: "summary",
    }),
    [{ type: "reasoning-delta", delta: "summary" }],
  );
});

test("translator emits usage and tool_calls finish reason on completion", () => {
  const translator = new ResponsesStreamTranslator();

  assert.deepEqual(
    translator.translate({
      type: "response.completed",
      response: {
        usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
        output: [{ type: "reasoning" }, { type: "function_call" }],
      },
    }),
    [
      {
        type: "usage",
        usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      },
      { type: "done", finishReason: "tool_calls" },
    ],
  );
  assert.equal(translator.isCompleted, true);
});

test("translator reports stop when the completed response has no tool call", () => {
  const translator = new ResponsesStreamTranslator();

  assert.deepEqual(
    translator.translate({
      type: "response.completed",
      response: { output: [{ type: "message" }] },
    }),
    [{ type: "done", finishReason: "stop" }],
  );
});

test("translator throws on response.failed with the provider message", () => {
  const translator = new ResponsesStreamTranslator();

  assert.throws(
    () =>
      translator.translate({
        type: "response.failed",
        response: { error: { message: "provider exploded" } },
      }),
    /provider exploded/,
  );
});

test("streamResponsesFrames translates a full stream in order", async () => {
  const events: ResponsesStreamEvent[] = [
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "lookup",
      },
    },
    {
      type: "response.function_call_arguments.delta",
      item_id: "fc_1",
      output_index: 0,
      delta: '{"q"',
    },
    {
      type: "response.function_call_arguments.delta",
      item_id: "fc_1",
      delta: ":1}",
    },
    { type: "response.output_text.delta", delta: "hi" },
    { type: "response.reasoning_text.delta", delta: "why" },
    { type: "response.reasoning_summary_text.delta", delta: "brief" },
    {
      type: "response.completed",
      response: {
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
        output: [{ type: "function_call" }],
      },
    },
  ];

  async function* source(): AsyncIterable<ResponsesStreamEvent> {
    for (const event of events) {
      yield event;
    }
  }

  const frames: ModelFrame[] = [];
  for await (const frame of streamResponsesFrames(source())) {
    frames.push(frame);
  }

  assert.deepEqual(frames, [
    { type: "tool-call-delta", index: 0, id: "call_1", name: "lookup" },
    { type: "tool-call-delta", index: 0, argumentsDelta: '{"q"' },
    { type: "tool-call-delta", index: 0, argumentsDelta: ":1}" },
    { type: "text-delta", delta: "hi" },
    { type: "reasoning-delta", delta: "why" },
    { type: "reasoning-delta", delta: "brief" },
    {
      type: "usage",
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    },
    { type: "done", finishReason: "tool_calls" },
  ]);
});

test("streamResponsesFrames throws when the provider fails mid-stream", async () => {
  async function* source(): AsyncIterable<ResponsesStreamEvent> {
    yield {
      type: "response.failed",
      response: { error: { message: "provider exploded" } },
    };
  }

  await assert.rejects(
    (async () => {
      for await (const _frame of streamResponsesFrames(source())) {
        // drain
      }
    })(),
    /provider exploded/,
  );
});
