import assert from "node:assert/strict";
import test from "node:test";

import { AttachmentId } from "@openai-harness/attachment";
import type { ContentBlock } from "@openai-harness/llm";
import type { SessionEvent } from "@openai-harness/session";

import { PRUNE_MARKER } from "../src/config";
import { ToolResultPruner } from "../src/tool-result-pruner";
import { TestSession } from "./session";

function imageBlock(): ContentBlock {
  return {
    type: "image",
    ref: {
      attachmentId: AttachmentId(`sha256:${"a".repeat(64)}`),
      mediaType: "image/png",
      bytes: 1,
      width: 1,
      height: 1,
    },
  };
}

function appendToolResult(session: TestSession, text: string): number {
  const event = session.append("tool/result", {
    turn: 1,
    step: 1,
    message: {
      role: "tool",
      toolCallId: "call-1",
      content: [{ type: "text", text }],
    },
  });
  return event.seq;
}

test("prunes head and tail around the marker while preserving block order", () => {
  const pruner = new ToolResultPruner({
    thresholdChars: 100,
    headChars: 10,
    tailChars: 10,
  });
  const original: ContentBlock[] = [
    { type: "text", text: "a".repeat(60) },
    imageBlock(),
    { type: "text", text: "b".repeat(60) },
  ];

  const pruned = pruner.pruneContent(original);
  assert.ok(pruned);
  assert.deepEqual(
    pruned.map((block) => block.type),
    ["text", "image", "text"],
  );
  const head = pruned[0];
  const tail = pruned[2];
  assert.equal(head?.type, "text");
  assert.equal(tail?.type, "text");
  assert.equal(
    head?.type === "text" ? head.text : "",
    `${"a".repeat(10)}${PRUNE_MARKER}`,
  );
  assert.equal(tail?.type === "text" ? tail.text : "", "b".repeat(10));
  assert.ok(pruner.measureContent(pruned) <= 100);
});

test("does not split surrogate pairs when slicing text", () => {
  const pruner = new ToolResultPruner({
    thresholdChars: 100,
    headChars: 10,
    tailChars: 10,
  });
  const emoji = "😀";
  const pruned = pruner.pruneContent([
    { type: "text", text: emoji.repeat(120) },
  ]);

  assert.ok(pruned);
  const text = pruned[0];
  assert.equal(text?.type, "text");
  const value = text?.type === "text" ? text.text : "";
  assert.equal(Array.from(value).slice(0, 10).join(""), emoji.repeat(10));
  assert.ok(!value.includes("�"));
});

test("returns null when the text is within budget", () => {
  const pruner = new ToolResultPruner({
    thresholdChars: 100,
    headChars: 10,
    tailChars: 10,
  });
  assert.equal(
    pruner.pruneContent([{ type: "text", text: "x".repeat(100) }]),
    null,
  );
});

test("never prunes the most recent tool results", () => {
  const session = new TestSession();
  const seqs = [
    appendToolResult(session, "x".repeat(9_000)),
    appendToolResult(session, "x".repeat(9_000)),
    appendToolResult(session, "x".repeat(9_000)),
    appendToolResult(session, "x".repeat(9_000)),
  ];

  const pruner = new ToolResultPruner();
  const result = pruner.pruneSession(session);

  assert.deepEqual(
    result.pruned.map((entry) => entry.originalSeq),
    [seqs[0], seqs[1]],
  );
  const targets = session.events
    .filter(
      (event): event is Extract<SessionEvent, { type: "compaction/prune" }> =>
        event.type === "compaction/prune",
    )
    .map((event) => event.data.originalSeq);
  assert.deepEqual(targets, [seqs[0], seqs[1]]);
  assert.ok(result.charsRemoved > 0);
});
