import test from "node:test";
import assert from "node:assert/strict";

import { MessageId, type ContentBlock, type UserMessage } from "@openai-harness/llm";
import type { Agent, AgentSession } from "../src/agent-types";
import type { AgentLoopHost, ExecuteToolOutput } from "../src/host";
import {
  executeToolCalls,
  TOOL_ABORTED_BEFORE_DISPATCH,
  type ToolCallSpec,
} from "../src/tool-calls";
import { RecordingSession, testHeader } from "./session-fixture";

/** One fake registry entry: concurrency mode plus its canned outcome. */
interface FakeTool {
  concurrencySafe: boolean;
  run?: () => Promise<unknown>;
  result?: ExecuteToolOutput;
}

const tools = new Map<string, FakeTool>();

function registerTool(
  name: string,
  options: {
    concurrencySafe: boolean;
    run?: () => Promise<unknown>;
    result?: ExecuteToolOutput;
  },
): void {
  tools.set(name, options);
}

/**
 * Host tool service standing in for the application registry.
 *
 * Concurrency classification and execution are the host contract; the
 * scheduler's ordering, drain, and result-commit behavior stay in this package.
 * The aborted-after-settle outcome mirrors the registry: cancellation that
 * arrives after the body settled still wins over success.
 */
function toolHost(): AgentLoopHost {
  return {
    resolveDriver() {
      throw new Error("driver is not used by the scheduler");
    },
    provider: () => "test-provider",
    model: () => "test-model",
    deriveMessages: () => [],
    executionMode: (input) =>
      tools.get(input.name)?.concurrencySafe
        ? { kind: "parallel" }
        : { kind: "exclusive" },
    executeTool: async (name, input) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`unknown tool: ${name}`);
      if (tool.result) return tool.result;

      const data = tool.run ? await tool.run() : { ok: true };
      if (input.signal?.aborted) {
        return {
          success: false,
          error: "tool call aborted",
          content: [],
        };
      }
      return {
        success: true,
        data,
        content: [
          {
            type: "text",
            text: typeof data === "string" ? data : JSON.stringify(data),
          },
        ],
      };
    },
  };
}

const host = toolHost();

/** Minimal agent view: call scheduling needs only the owning session. */
function asAgent(session: AgentSession): Agent {
  return { id: session.id, session } as unknown as Agent;
}

function spec(id: string, name: string): ToolCallSpec {
  return { id, name, arguments: "{}" };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function eventTypes(session: RecordingSession): string[] {
  return session.events.map((event) => event.type);
}

function callIds(session: RecordingSession, type: "tool/call" | "tool/result"): string[] {
  return session.events.flatMap((event) => {
    if (event.type === "tool/call" && type === "tool/call") {
      return [String(event.data.callId)];
    }
    if (event.type === "tool/result" && type === "tool/result") {
      return [String(event.data.message.toolCallId)];
    }
    return [];
  });
}

test("parallel calls overlap and commit results in model order", async () => {
  const completion: string[] = [];
  registerTool("test_parallel_slow", {
    concurrencySafe: true,
    run: async () => {
      await delay(50);
      completion.push("slow");
      return "slow";
    },
  });
  registerTool("test_parallel_fast", {
    concurrencySafe: true,
    run: async () => {
      await delay(5);
      completion.push("fast");
      return "fast";
    },
  });

  const session = new RecordingSession(testHeader("tool-calls-test"));
  const results = await executeToolCalls(
    asAgent(session),
    1,
    1,
    [
      spec("call_slow", "test_parallel_slow"),
      spec("call_fast", "test_parallel_fast"),
    ],
    undefined,
    { host },
  );

  // Dispatch overlapped: the second call finished first.
  assert.deepEqual(completion, ["fast", "slow"]);
  // Commit stayed model-ordered.
  assert.deepEqual(callIds(session, "tool/call"), ["call_slow", "call_fast"]);
  assert.deepEqual(callIds(session, "tool/result"), ["call_slow", "call_fast"]);
  assert.deepEqual(results.map((result) => result.callId), ["call_slow", "call_fast"]);
  assert.ok(results.every((result) => result.success));
});

test("image-bearing tool output is stored as content blocks", async () => {
  const blocks: ContentBlock[] = [
    { type: "text", text: "### Image 1 (attachment: sha256:...)" },
    {
      type: "image",
      ref: {
        attachmentId: "b".repeat(64),
        mediaType: "image/png",
        bytes: 3,
        width: 1,
        height: 1,
      },
    } as unknown as ContentBlock,
  ];
  registerTool("test_image_result", {
    concurrencySafe: false,
    result: { success: true, data: { ok: true }, content: blocks },
  });

  const session = new RecordingSession(testHeader("tool-calls-image"));
  await executeToolCalls(
    asAgent(session),
    1,
    1,
    [spec("call_image", "test_image_result")],
    undefined,
    { host },
  );

  const result = session.events.find((event) => event.type === "tool/result");
  assert.ok(result);
  const message = (result.data as { message: { content: ContentBlock[] } })
    .message;
  assert.deepEqual(message.content, blocks);
});

test("exclusive calls form a barrier between parallel pools", async () => {
  const order: string[] = [];
  registerTool("test_barrier_parallel", {
    concurrencySafe: true,
    run: async () => {
      await delay(30);
      order.push("parallel");
      return "parallel";
    },
  });
  registerTool("test_barrier_exclusive", {
    concurrencySafe: false,
    run: async () => {
      order.push("exclusive");
      return "exclusive";
    },
  });
  registerTool("test_barrier_after", {
    concurrencySafe: true,
    run: async () => {
      order.push("after");
      return "after";
    },
  });

  const session = new RecordingSession(testHeader("tool-calls-barrier"));
  const results = await executeToolCalls(
    asAgent(session),
    1,
    1,
    [
      spec("call_parallel", "test_barrier_parallel"),
      spec("call_exclusive", "test_barrier_exclusive"),
      spec("call_after", "test_barrier_after"),
    ],
    undefined,
    { host },
  );

  // The exclusive call waited for the parallel pool to drain and ran alone.
  assert.deepEqual(order, ["parallel", "exclusive", "after"]);
  assert.deepEqual(callIds(session, "tool/result"), [
    "call_parallel",
    "call_exclusive",
    "call_after",
  ]);
  assert.equal(results.length, 3);
});

test("abort drains started calls and records synthetic results for skipped calls", async () => {
  registerTool("test_abort_running", {
    concurrencySafe: true,
    run: async () => {
      await delay(30);
      return "ran";
    },
  });
  registerTool("test_abort_skipped_b", { concurrencySafe: true });
  registerTool("test_abort_skipped_c", { concurrencySafe: true });

  const controller = new AbortController();
  const session = new RecordingSession(testHeader("tool-calls-abort"));
  const running = executeToolCalls(
    asAgent(session),
    1,
    1,
    [
      spec("call_running", "test_abort_running"),
      spec("call_skipped_b", "test_abort_skipped_b"),
      spec("call_skipped_c", "test_abort_skipped_c"),
    ],
    controller.signal,
    { maxParallelToolCalls: 1, host },
  );

  setTimeout(() => controller.abort(), 5);
  const results = await running;

  // The started call committed its real result; both skipped calls received
  // synthetic error results in model order.
  assert.deepEqual(callIds(session, "tool/call"), [
    "call_running",
    "call_skipped_b",
    "call_skipped_c",
  ]);
  assert.deepEqual(callIds(session, "tool/result"), [
    "call_running",
    "call_skipped_b",
    "call_skipped_c",
  ]);
  assert.deepEqual(eventTypes(session), [
    "tool/call",
    "tool/result",
    "tool/call",
    "tool/result",
    "tool/call",
    "tool/result",
  ]);

  // Cancellation after the body settled wins over success (dsh semantics);
  // the scheduler still drained and committed the started call.
  assert.equal(results[0]!.success, false);
  assert.equal(results[0]!.error, "tool call aborted");
  assert.equal(results[1]!.success, false);
  assert.equal(results[2]!.success, false);
  assert.equal(results[1]!.error, "Operation aborted");

  const synthetic = session.events.filter(
    (event) =>
      event.type === "tool/result" &&
      event.data.error?.code === TOOL_ABORTED_BEFORE_DISPATCH,
  );
  assert.equal(synthetic.length, 2);

  // Every result cites a preceding call, so the log replays valid.
  const seen = new Set<string>();
  for (const event of session.events) {
    if (event.type === "tool/call") seen.add(String(event.data.callId));
    if (event.type === "tool/result") {
      assert.ok(seen.has(String(event.data.message.toolCallId)));
    }
  }
});

test("deferred context and concludeTurn propagate through the scheduler", async () => {
  const deferred: UserMessage = {
    id: MessageId("deferred-context"),
    role: "user",
    content: [{ type: "text", text: "deferred" }],
  };

  registerTool("test_plain_tool", { concurrencySafe: false });
  registerTool("test_concluding_tool", {
    concurrencySafe: false,
    result: {
      success: true,
      data: { ok: true },
      content: [{ type: "text", text: "ok" }],
      additionalContexts: [deferred],
      concludesTurn: true,
    },
  });

  const session = new RecordingSession(testHeader("tool-calls-context"));
  const results = await executeToolCalls(
    asAgent(session),
    1,
    1,
    [
      spec("call_context", "test_concluding_tool"),
      spec("call_plain", "test_plain_tool"),
    ],
    undefined,
    { host },
  );

  assert.equal(results.length, 2);
  assert.equal(results[0]!.additionalContexts?.[0]?.id, "deferred-context");
  assert.equal(results[0]!.concludesTurn, true);
  assert.equal(results[1]!.additionalContexts, undefined);
  assert.equal(results[1]!.concludesTurn, undefined);
});
