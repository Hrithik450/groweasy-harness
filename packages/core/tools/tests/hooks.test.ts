import test from "node:test";
import assert from "node:assert/strict";
import { ToolCallId } from "@openai-harness/llm";
import { ToolHookRegistry } from "../src/hooks";
import type {
  ToolExecution,
  ToolExecutionResult,
  ToolRunContext,
} from "../src/types";

const NEVER_ABORTED = new AbortController().signal;

function execution(): ToolExecution {
  return {
    callId: ToolCallId("call-1"),
    name: "demo",
    arguments: {},
    signal: NEVER_ABORTED,
  };
}

function runContext(): ToolRunContext {
  return {
    ...execution(),
    deferContext(): void {},
    concludeTurn(): void {},
  };
}

function ok(text: string): ToolExecutionResult {
  return {
    isError: false,
    value: text,
    content: [{ type: "text", text }],
  };
}

test("pre-execute waterfall: first registered wraps outermost", async () => {
  const hooks = new ToolHookRegistry();
  const order: string[] = [];

  hooks.usePreExecute(async (_exec, next) => {
    order.push("a:before");
    const decision = await next();
    order.push("a:after");
    return decision;
  });
  hooks.usePreExecute(async (_exec, next) => {
    order.push("b:before");
    const decision = await next();
    order.push("b:after");
    return decision;
  });

  const decision = await hooks.runPreExecute(execution(), async () => {
    order.push("terminal");
    return { kind: "allow" };
  });

  assert.deepEqual(decision, { kind: "allow" });
  assert.deepEqual(order, [
    "a:before",
    "b:before",
    "terminal",
    "b:after",
    "a:after",
  ]);
});

test("pre-execute deny short-circuits the remaining waterfall", async () => {
  const hooks = new ToolHookRegistry();
  let innerCalled = false;
  let terminalCalled = false;

  hooks.usePreExecute(async () => ({
    kind: "deny",
    reason: "blocked",
    info: { name: "PolicyError", code: "DENIED" },
  }));
  hooks.usePreExecute(async (_exec, next) => {
    innerCalled = true;
    return next();
  });

  const decision = await hooks.runPreExecute(execution(), async () => {
    terminalCalled = true;
    return { kind: "allow" };
  });

  assert.deepEqual(decision, {
    kind: "deny",
    reason: "blocked",
    info: { name: "PolicyError", code: "DENIED" },
  });
  assert.equal(innerCalled, false);
  assert.equal(terminalCalled, false);
});

test("pre-execute cancel never reaches the terminal decision", async () => {
  const hooks = new ToolHookRegistry();
  let terminalCalled = false;

  hooks.usePreExecute(async () => ({ kind: "cancel" }));

  const decision = await hooks.runPreExecute(execution(), async () => {
    terminalCalled = true;
    return { kind: "allow" };
  });

  assert.deepEqual(decision, { kind: "cancel" });
  assert.equal(terminalCalled, false);
});

test("execute waterfall wraps the tool body in registration order", async () => {
  const hooks = new ToolHookRegistry();
  const order: string[] = [];

  hooks.useExecute(async (_exec, next) => {
    order.push("outer");
    return next();
  });
  hooks.useExecute(async (_exec, next) => {
    order.push("inner");
    return next();
  });

  const result = await hooks.runExecute(runContext(), async () => {
    order.push("body");
    return ok("body");
  });

  assert.deepEqual(order, ["outer", "inner", "body"]);
  assert.equal(result.isError, false);
});

test("post-execute hook can replace accepted content", async () => {
  const hooks = new ToolHookRegistry();
  const replacement = [{ type: "text" as const, text: "replacement" }];

  hooks.usePostExecute(async (_exec, _result, next) => {
    const decision = await next();
    if (decision.kind === "accept") {
      return { kind: "accept", content: replacement };
    }
    return decision;
  });

  const decision = await hooks.runPostExecute(execution(), ok("original"));

  assert.equal(decision.kind, "accept");
  assert.deepEqual(
    decision.kind === "accept" ? decision.content : undefined,
    replacement,
  );
});

test("post-execute hook can block the settled result", async () => {
  const hooks = new ToolHookRegistry();

  hooks.usePostExecute(async () => ({
    kind: "block",
    feedback: [{ type: "text", text: "nope" }],
  }));

  const decision = await hooks.runPostExecute(execution(), ok("original"));

  assert.deepEqual(decision, {
    kind: "block",
    feedback: [{ type: "text", text: "nope" }],
  });
});

test("disposer removes only its own hook and is idempotent", async () => {
  const hooks = new ToolHookRegistry();
  const order: string[] = [];

  const first = hooks.usePreExecute(async (_exec, next) => {
    order.push("a");
    return next();
  });
  hooks.usePreExecute(async (_exec, next) => {
    order.push("b");
    return next();
  });

  first();
  first();

  await hooks.runPreExecute(execution());

  assert.deepEqual(order, ["b"]);
});
