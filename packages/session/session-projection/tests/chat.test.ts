import test from "node:test";
import assert from "node:assert/strict";
import type { SessionEvent } from "@openai-harness/session";
import { MessageId } from "@openai-harness/llm";
import { SessionSeq } from "@openai-harness/session";
import type { ContentBlock, Message, ToolCallBlock } from "@openai-harness/llm";
import { toChatMessages } from "../src/derive/chat";

/** Test-only flattening, preserving the assertions on model-visible text. */
function blocksToText(blocks: readonly ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        parts.push(block.text);
        break;
      case "block":
        parts.push(`[Rendered UI Block: ${block.spec.root}]`);
        break;
      case "image": {
        const alt = block.alt ? ` (${block.alt})` : "";
        parts.push(`[Image attachment id="${block.ref.attachmentId}"${alt}]`);
        break;
      }
      case "file": {
        const filename = block.filename ? ` (${block.filename})` : "";
        parts.push(
          `[File attachment id="${block.ref.attachmentId}"${filename}]`,
        );
        break;
      }
      case "tool-call":
      case "reasoning":
        break;
    }
  }
  return parts.join("\n\n").trim();
}

function flattenForTest(messages: readonly Message[]) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool" as const,
        content:
          typeof message.content === "string"
            ? message.content
            : blocksToText(message.content),
        toolCallId: String(message.toolCallId),
      };
    }
    if (message.role === "system") {
      return {
        role: "system" as const,
        content:
          typeof message.content === "string"
            ? message.content
            : blocksToText(message.content),
      };
    }
    if (message.role === "assistant") {
      const text = blocksToText(message.content);
      const toolCalls = message.content
        .filter((block): block is ToolCallBlock => block.type === "tool-call")
        .map((block) => ({
          id: String(block.id),
          name: block.name,
          arguments: block.arguments,
        }));
      return {
        role: "assistant" as const,
        content: text || null,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
    }
    return { role: "user" as const, content: blocksToText(message.content) };
  });
}

function derive(
  events: readonly SessionEvent[],
  instructions?: string,
) {
  return flattenForTest(toChatMessages(events, instructions));
}

function ev(type: string, data: unknown, seq: number): SessionEvent {
  return {
    seq: SessionSeq(seq),
    type,
    time: Date.parse("2026-01-01T00:00:00.000Z"),
    data,
  } as unknown as SessionEvent;
}

test("maps user, assistant tool call, and tool result in order", () => {
  const messages = derive(
    [
      ev(
        "user/message",
        {
          id: MessageId("user-1"),
          role: "user",
          content: [{ type: "text", text: "Find campaigns" }],
          source: { kind: "user" },
        },
        0,
      ),
      ev(
        "assistant/message",
        {
          turn: 1,
          step: 1,
          message: {
            id: MessageId("assistant-1"),
            role: "assistant",
            content: [
              { type: "text", text: "Checking." },
              {
                type: "tool-call",
                id: "call-1",
                name: "fetchMetaCampaigns",
                arguments: '{"accountId":"act_1"}',
              },
            ],
          },
        },
        1,
      ),
      ev(
        "tool/result",
        {
          turn: 1,
          step: 1,
          message: {
            role: "tool",
            toolCallId: "call-1",
            content: [{ type: "text", text: "campaigns: []" }],
          },
        },
        2,
      ),
    ],
    "Be precise.",
  );

  assert.deepEqual(messages, [
    { role: "system", content: "Be precise." },
    { role: "user", content: "Find campaigns" },
    {
      role: "assistant",
      content: "Checking.",
      toolCalls: [
        {
          id: "call-1",
          name: "fetchMetaCampaigns",
          arguments: '{"accountId":"act_1"}',
        },
      ],
    },
    { role: "tool", content: "campaigns: []", toolCallId: "call-1" },
  ]);
});

test("assistant tool call without text uses null content", () => {
  const messages = derive([
    ev(
      "assistant/message",
      {
        turn: 1,
        step: 1,
        message: {
          id: MessageId("assistant-2"),
          role: "assistant",
          content: [
            {
              type: "tool-call",
              id: "call-2",
              name: "queryMetaGraphAPI",
              arguments: "{}",
            },
          ],
        },
      },
      0,
    ),
  ]);

  assert.deepEqual(messages, [
    {
      role: "assistant",
      content: null,
      toolCalls: [
        { id: "call-2", name: "queryMetaGraphAPI", arguments: "{}" },
      ],
    },
  ]);
});

test("includes ui-action submissions and skips user tool-result snapshots", () => {
  const messages = derive([
    ev(
      "user/message",
      {
        id: MessageId("action-1"),
        role: "user",
        content: [{ type: "text", text: "approved the budget" }],
        source: { kind: "ui-action", blockId: "block-1" },
      },
      0,
    ),
    ev(
      "user/message",
      {
        id: MessageId("tool-snapshot"),
        role: "user",
        content: [{ type: "text", text: "raw tool output" }],
        source: {
          kind: "tool-result",
          callId: "call-3",
          name: "searchWeb",
          success: true,
          output: "raw tool output",
        },
      },
      1,
    ),
    ev(
      "user/message",
      {
        id: MessageId("visible-1"),
        role: "user",
        content: [{ type: "text", text: "visible prompt" }],
        source: { kind: "user" },
      },
      2,
    ),
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "approved the budget" },
    { role: "user", content: "visible prompt" },
  ]);
});

test("projects UI, image, and file blocks to text placeholders", () => {
  const messages = derive([
    ev(
      "user/message",
      {
        id: MessageId("rich-1"),
        role: "user",
        content: [
          { type: "text", text: "See below" },
          { type: "block", spec: { root: "Card" } },
          {
            type: "image",
            ref: { attachmentId: "img-1" },
            alt: "preview",
          },
          {
            type: "file",
            ref: { attachmentId: "file-1" },
            filename: "report.pdf",
          },
        ],
        source: { kind: "user" },
      },
      0,
    ),
  ]);

  assert.deepEqual(messages, [
    {
      role: "user",
      content:
        'See below\n\n[Rendered UI Block: Card]\n\n[Image attachment id="img-1" (preview)]\n\n[File attachment id="file-1" (report.pdf)]',
    },
  ]);
});

test("maps system messages after instructions", () => {
  const messages = derive(
    [
      ev("system/message", { role: "system", content: "Runtime note" }, 0),
      ev(
        "system/message",
        { role: "system", content: [{ type: "text", text: "Second note" }] },
        1,
      ),
    ],
    "Instructions",
  );

  assert.deepEqual(messages, [
    { role: "system", content: "Instructions" },
    { role: "system", content: "Runtime note" },
    { role: "system", content: "Second note" },
  ]);
});

test("hides checkpoint-shadowed events and inserts the summary in their place", () => {
  const messages = derive([
    ev(
      "user/message",
      {
        id: MessageId("old-1"),
        role: "user",
        content: [{ type: "text", text: "old prompt one" }],
        source: { kind: "user" },
      },
      0,
    ),
    ev(
      "user/message",
      {
        id: MessageId("old-2"),
        role: "user",
        content: [{ type: "text", text: "old prompt two" }],
        source: { kind: "user" },
      },
      1,
    ),
    ev(
      "user/message",
      {
        id: MessageId("recent-1"),
        role: "user",
        content: [{ type: "text", text: "recent prompt" }],
        source: { kind: "user" },
      },
      2,
    ),
    ev(
      "compaction/checkpoint",
      {
        compactionId: "compaction-1",
        summary: "old summary",
        shadowedRange: {
          startSeq: SessionSeq(0),
          endSeq: SessionSeq(1),
        },
        shadowedSeqs: [SessionSeq(0), SessionSeq(1)],
        shadowedTokenCount: 10,
        trigger: "pressure",
      },
      3,
    ),
    ev(
      "user/message",
      {
        id: MessageId("checkpoint-1"),
        role: "user",
        content: [{ type: "text", text: "framed old summary" }],
        source: { kind: "compact-checkpoint", compactionId: "compaction-1" },
      },
      4,
    ),
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "framed old summary" },
    { role: "user", content: "recent prompt" },
  ]);
});

test("only replays the newest checkpoint when ranges overlap", () => {
  const messages = derive([
    ev(
      "user/message",
      {
        id: MessageId("overlap-old-1"),
        role: "user",
        content: [{ type: "text", text: "old one" }],
        source: { kind: "user" },
      },
      0,
    ),
    ev(
      "user/message",
      {
        id: MessageId("overlap-old-2"),
        role: "user",
        content: [{ type: "text", text: "old two" }],
        source: { kind: "user" },
      },
      1,
    ),
    ev(
      "user/message",
      {
        id: MessageId("overlap-recent"),
        role: "user",
        content: [{ type: "text", text: "recent" }],
        source: { kind: "user" },
      },
      2,
    ),
    ev(
      "compaction/checkpoint",
      {
        compactionId: "compaction-1",
        summary: "summary one",
        shadowedRange: { startSeq: SessionSeq(0), endSeq: SessionSeq(1) },
        shadowedSeqs: [SessionSeq(0), SessionSeq(1)],
        shadowedTokenCount: 10,
        trigger: "pressure",
      },
      3,
    ),
    ev(
      "user/message",
      {
        id: MessageId("checkpoint-1"),
        role: "user",
        content: [{ type: "text", text: "summary one" }],
        source: { kind: "compact-checkpoint", compactionId: "compaction-1" },
      },
      4,
    ),
    ev(
      "compaction/checkpoint",
      {
        compactionId: "compaction-2",
        summary: "summary two",
        shadowedRange: { startSeq: SessionSeq(0), endSeq: SessionSeq(1) },
        shadowedSeqs: [SessionSeq(0), SessionSeq(1)],
        shadowedTokenCount: 10,
        trigger: "pressure",
      },
      5,
    ),
    ev(
      "user/message",
      {
        id: MessageId("checkpoint-2"),
        role: "user",
        content: [{ type: "text", text: "summary two" }],
        source: { kind: "compact-checkpoint", compactionId: "compaction-2" },
      },
      6,
    ),
  ]);

  assert.deepEqual(messages, [
    { role: "user", content: "summary two" },
    { role: "user", content: "recent" },
  ]);
});

test("applies compaction prune replacements to tool results", () => {
  const messages = derive([
    ev(
      "assistant/message",
      {
        turn: 1,
        step: 1,
        message: {
          id: MessageId("assistant-prune"),
          role: "assistant",
          content: [
            {
              type: "tool-call",
              id: "call-prune",
              name: "search",
              arguments: "{}",
            },
          ],
        },
      },
      0,
    ),
    ev(
      "tool/result",
      {
        turn: 1,
        step: 1,
        message: {
          role: "tool",
          toolCallId: "call-prune",
          content: [{ type: "text", text: "full tool output" }],
        },
      },
      1,
    ),
    ev(
      "compaction/prune",
      {
        originalSeq: SessionSeq(1),
        content: [{ type: "text", text: "pruned tool output" }],
        charsBefore: 16,
        charsAfter: 17,
      },
      2,
    ),
  ]);

  assert.deepEqual(messages, [
    {
      role: "assistant",
      content: null,
      toolCalls: [{ id: "call-prune", name: "search", arguments: "{}" }],
    },
    {
      role: "tool",
      content: "pruned tool output",
      toolCallId: "call-prune",
    },
  ]);
});
