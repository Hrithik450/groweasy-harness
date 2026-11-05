import assert from "node:assert/strict";
import { test } from "node:test";

import { MessageId } from "@openai-harness/llm";
import type {
  Message,
  ModelDriver,
  ModelFrame,
  ModelStreamInput,
} from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";

import { deriveMessages } from "../src/derive";
import { BasicCompactionStrategy } from "../src/strategy";
import type { SummarizationInput, Summarizer } from "../src/types";
import { TestSession } from "./session";

function textOf(message: Message | undefined): string {
  if (!message) return "";
  if (message.role === "system") {
    return typeof message.content === "string" ? message.content : "";
  }
  if (message.role === "tool") {
    return typeof message.content === "string"
      ? message.content
      : message.content
          .filter((block) => block.type === "text")
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("\n\n");
  }
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n\n");
}

function textDriver(
  text: string,
  onInput?: (input: ModelStreamInput) => void,
): ModelDriver {
  return {
    async *stream(input: ModelStreamInput): AsyncGenerator<ModelFrame> {
      onInput?.(input);
      yield { type: "text-delta", delta: text };
      yield { type: "done", finishReason: "stop" };
    },
  };
}

let idCounter = 0;

function appendUser(session: TestSession, text: string): SessionEvent {
  idCounter += 1;
  return session.append("user/message", {
    id: MessageId(`user-${idCounter}`),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

function appendAssistantUsage(
  session: TestSession,
  promptTokens: number,
): SessionEvent {
  idCounter += 1;
  return session.append("assistant/message", {
    turn: 1,
    step: 1,
    message: {
      id: MessageId(`assistant-${idCounter}`),
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    },
    usage: {
      promptTokens,
      completionTokens: 1,
      totalTokens: promptTokens + 1,
    },
  });
}

function appendAssistantCall(session: TestSession): SessionEvent {
  idCounter += 1;
  return session.append("assistant/message", {
    turn: 1,
    step: 1,
    message: {
      id: MessageId(`assistant-${idCounter}`),
      role: "assistant",
      content: [
        { type: "tool-call", id: "call-1", name: "search", arguments: "{}" },
      ],
    },
  });
}

function appendToolResult(session: TestSession, text: string): SessionEvent {
  idCounter += 1;
  return session.append("tool/result", {
    turn: 1,
    step: 1,
    message: {
      role: "tool",
      toolCallId: "call-1",
      content: [{ type: "text", text }],
    },
  });
}

test("returns null below the pressure threshold", async () => {
  const session = new TestSession();
  appendUser(session, "old one");
  appendUser(session, "old two");
  appendAssistantUsage(session, 100);

  const engine = new BasicCompactionStrategy({
    contextWindow: 1_000,
    retainTokens: 1,
    retainRatio: 0.0001,
  });
  const result = await engine.maybeCompact(session, textDriver("unused"));

  assert.equal(result, null);
  assert.equal(
    session.events.filter((event) => event.type.startsWith("compaction/"))
      .length,
    0,
  );
});

test("summarizes old messages and appends a checkpoint at pressure", async () => {
  const session = new TestSession();
  appendUser(session, "old one");
  appendUser(session, "old two");
  appendAssistantUsage(session, 900);

  let captured: SummarizationInput | undefined;
  const summarizer: Summarizer = {
    async summarize(input) {
      captured = input;
      return { summary: "condensed" };
    },
  };
  const engine = new BasicCompactionStrategy(
    { contextWindow: 1_000, retainTokens: 1, retainRatio: 0.0001 },
    { summarizer },
  );

  const result = await engine.maybeCompact(session, textDriver("unused"));

  assert.ok(result);
  assert.equal(result.summary, "condensed");
  assert.equal(result.checkpointSeq, 3);
  assert.equal(result.messageSeq, 4);
  assert.deepEqual(result.shadowedRange, {
    startSeq: 0,
    endSeq: 1,
  });
  assert.deepEqual(
    (captured?.messages ?? []).map((message) => ({
      role: message.role,
      text: textOf(message),
    })),
    [
      { role: "user", text: "old one" },
      { role: "user", text: "old two" },
    ],
  );

  const checkpoint = session.events[3];
  assert.equal(checkpoint?.type, "compaction/checkpoint");
  if (checkpoint?.type !== "compaction/checkpoint") {
    assert.fail("checkpoint marker missing");
  }
  assert.equal(checkpoint.data.summary, "condensed");
  assert.equal(checkpoint.data.shadowedRange.startSeq, 0);
  assert.equal(checkpoint.data.shadowedRange.endSeq, 1);

  const message = session.events[4];
  assert.equal(message?.type, "user/message");
  if (message?.type !== "user/message") {
    assert.fail("checkpoint message missing");
  }
  assert.equal(message.data.source?.kind, "compact-checkpoint");
  assert.match(
    message.data.content[0]?.type === "text" ? message.data.content[0].text : "",
    /condensed/,
  );

  const derived = deriveMessages(session.events);
  assert.equal(derived.length, 2);
  assert.equal(derived[0]?.role, "user");
  assert.match(textOf(derived[0]), /condensed/);
  assert.equal(derived[1]?.role, "assistant");
  assert.equal(textOf(derived[1]), "ok");
});

test("does not re-trigger from usage recorded before a checkpoint", async () => {
  const session = new TestSession();
  appendUser(session, "old one");
  appendUser(session, "old two");
  appendAssistantUsage(session, 900);

  const summarizer: Summarizer = {
    async summarize() {
      return { summary: "condensed" };
    },
  };
  const engine = new BasicCompactionStrategy(
    { contextWindow: 1_000, retainTokens: 1, retainRatio: 0.0001 },
    { summarizer },
  );

  const first = await engine.maybeCompact(session, textDriver("unused"));
  assert.ok(first);

  const second = await engine.maybeCompact(session, textDriver("unused"));
  assert.equal(second, null);
  assert.equal(
    session.events.filter(
      (event) => event.type === "compaction/checkpoint",
    ).length,
    1,
  );
});

test("summarizes through the model driver by default", async () => {
  const session = new TestSession();
  appendUser(session, "old one");
  appendUser(session, "old two");
  appendAssistantUsage(session, 900);

  let seen: ModelStreamInput | undefined;
  const engine = new BasicCompactionStrategy({
    contextWindow: 1_000,
    retainTokens: 1,
    retainRatio: 0.0001,
  });
  const result = await engine.maybeCompact(
    session,
    textDriver("driver summary", (input) => {
      seen = input;
    }),
  );

  assert.ok(result);
  assert.equal(result.summary, "driver summary");
  assert.ok(seen);
  assert.equal(seen.messages.at(-1)?.role, "user");
  assert.match(textOf(seen.messages.at(-1)), /structured checkpoint/);
});

test("prunes old tool results before summarizing", async () => {
  const session = new TestSession();
  appendUser(session, "old one");
  appendAssistantCall(session);
  const toolResult = appendToolResult(session, "x".repeat(9_000));
  appendAssistantUsage(session, 10_000);

  const summarizer: Summarizer = {
    async summarize() {
      return { summary: "condensed" };
    },
  };
  const engine = new BasicCompactionStrategy(
    {
      contextWindow: 10_000,
      retainTokens: 1,
      retainRatio: 0.0001,
      toolResultPruner: { keepRecentResults: 0 },
    },
    { summarizer },
  );

  const result = await engine.maybeCompact(session, textDriver("unused"));

  assert.ok(result);
  assert.equal(result.prunedResults, 1);
  const pruneEvents = session.events.filter(
    (event): event is Extract<SessionEvent, { type: "compaction/prune" }> =>
      event.type === "compaction/prune",
  );
  assert.equal(pruneEvents.length, 1);
  assert.equal(pruneEvents[0]?.data.originalSeq, toolResult.seq);
  assert.ok(result.shadowedTokenCount > 0);
});
