import test from "node:test";
import assert from "node:assert/strict";
import { MessageId, ToolCallId } from "@openai-harness/llm";
import type { ContentBlock, UserMessage } from "@openai-harness/llm";
import { TOOL_TIMEOUT } from "../src/guards";
import {
  TOOL_ABORTED,
  TOOL_ABORTED_BEFORE_DISPATCH,
  ToolRegistry,
} from "../src/registry";
import type {
  ToolDefinition,
  ToolExecutionInput,
  ToolExecutionResult,
  ToolRunContext,
} from "../src/types";

const NEVER_ABORTED = new AbortController().signal;

interface ToolOptions {
  execute?: (args: unknown, exec: ToolRunContext) => Promise<unknown>;
  render?: (args: unknown, value: unknown) => ContentBlock[];
  timeoutMs?: number;
  isConcurrencySafe?: (args: unknown) => boolean;
  projectContent?: ToolDefinition["projectContent"];
  finalizeContent?: ToolDefinition["finalizeContent"];
}

function makeTool(name: string, options: ToolOptions = {}): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    parameters: { type: "object", additionalProperties: true },
    output: {
      schema: { type: "object", additionalProperties: true },
      render: options.render ?? (() => [{ type: "text", text: name }]),
    },
    execute: options.execute ?? (async () => ({ ok: true })),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.isConcurrencySafe !== undefined
      ? { isConcurrencySafe: options.isConcurrencySafe }
      : {}),
    ...(options.projectContent !== undefined
      ? { projectContent: options.projectContent }
      : {}),
    ...(options.finalizeContent !== undefined
      ? { finalizeContent: options.finalizeContent }
      : {}),
  };
}

let callCounter = 0;

function input(
  name: string,
  overrides: Partial<ToolExecutionInput> = {},
): ToolExecutionInput {
  callCounter += 1;
  return {
    callId: ToolCallId(`call-${callCounter}`),
    name,
    arguments: {},
    signal: NEVER_ABORTED,
    ...overrides,
  };
}

function message(text: string): UserMessage {
  return {
    id: MessageId(`message-${text}`),
    role: "user",
    content: [{ type: "text", text }],
  };
}

function textOf(result: ToolExecutionResult): string {
  return result.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
}

test("execute runs the single pipeline in order", async () => {
  const registry = new ToolRegistry();
  const order: string[] = [];

  registry.register(
    makeTool("ordered", {
      execute: async () => {
        order.push("body");
        return { ok: true };
      },
      projectContent: () => {
        order.push("project");
        return undefined;
      },
      finalizeContent: () => {
        order.push("finalize");
        return undefined;
      },
    }),
  );
  registry.guard(() => {
    order.push("guard");
    return undefined;
  });
  registry.hooks.usePreExecute(async (_exec, next) => {
    order.push("pre");
    return next();
  });
  registry.hooks.useExecute(async (_exec, next) => {
    order.push("around:before");
    const result = await next();
    order.push("around:after");
    return result;
  });
  registry.hooks.usePostExecute(async (_exec, _result, next) => {
    order.push("post:before");
    const decision = await next();
    order.push("post:after");
    return decision;
  });
  registry.onResult(() => {
    order.push("result");
  });

  const result = await registry.execute(input("ordered"));

  assert.equal(result.isError, false);
  assert.deepEqual(order, [
    "pre",
    "guard",
    "around:before",
    "body",
    "around:after",
    "project",
    "post:before",
    "post:after",
    "finalize",
    "result",
  ]);
});

test("pre-execute deny stops the body but still projects, posts, finalizes, and observes", async () => {
  const registry = new ToolRegistry();
  const order: string[] = [];

  registry.register(
    makeTool("denied", {
      execute: async () => {
        order.push("body");
        return {};
      },
      projectContent: () => {
        order.push("project");
        return undefined;
      },
      finalizeContent: () => {
        order.push("finalize");
        return undefined;
      },
    }),
  );
  registry.hooks.usePreExecute(async () => ({
    kind: "deny",
    reason: "nope",
    info: { name: "PolicyError", code: "DENY" },
  }));
  registry.hooks.usePostExecute(async (_exec, result) => {
    order.push(`post:${result.isError}`);
    return { kind: "accept" };
  });
  registry.onResult(() => {
    order.push("result");
  });

  const result = await registry.execute(input("denied"));

  assert.equal(result.isError, true);
  assert.equal(result.error.message, "nope");
  assert.deepEqual(result.error.info, {
    name: "PolicyError",
    code: "DENY",
  });
  assert.deepEqual(order, ["project", "post:true", "finalize", "result"]);
});

test("pre-execute cancel selects the canonical pre-dispatch cancellation", async () => {
  const registry = new ToolRegistry();
  let bodyCalled = false;

  registry.register(
    makeTool("cancelled", {
      execute: async () => {
        bodyCalled = true;
        return {};
      },
    }),
  );
  registry.hooks.usePreExecute(async () => ({ kind: "cancel" }));

  const result = await registry.execute(input("cancelled"));

  assert.equal(bodyCalled, false);
  assert.equal(result.isError, true);
  assert.equal(
    result.error.info?.code,
    TOOL_ABORTED_BEFORE_DISPATCH,
  );
});

test("a monotonic guard denial cannot be re-allowed", async () => {
  const registry = new ToolRegistry();
  let bodyCalled = false;

  registry.register(
    makeTool("guarded", {
      execute: async () => {
        bodyCalled = true;
        return {};
      },
    }),
  );
  registry.hooks.usePreExecute(async (_exec, next) => {
    const decision = await next();
    return decision;
  });
  registry.guard(() => "guard says no");

  const result = await registry.execute(input("guarded"));

  assert.equal(bodyCalled, false);
  assert.equal(result.isError, true);
  assert.equal(result.error.message, "guard says no");
  assert.equal(textOf(result), "Error: guard says no");
});

test("timeout returns the distinct timeout result", async () => {
  const registry = new ToolRegistry();

  registry.register(
    makeTool("slow", {
      timeoutMs: 5,
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { ok: true };
      },
    }),
  );

  const result = await registry.execute(input("slow"));

  assert.equal(result.isError, true);
  assert.equal(result.error.info?.code, TOOL_TIMEOUT);
  assert.match(textOf(result), /timed out after 5ms/);
});

test("cancellation before dispatch returns ABORTED_BEFORE_DISPATCH", async () => {
  const registry = new ToolRegistry();
  const controller = new AbortController();
  controller.abort();
  let bodyCalled = false;

  registry.register(
    makeTool("cancelled-before", {
      execute: async () => {
        bodyCalled = true;
        return {};
      },
    }),
  );

  const result = await registry.execute(
    input("cancelled-before", { signal: controller.signal }),
  );

  assert.equal(bodyCalled, false);
  assert.equal(result.isError, true);
  assert.equal(
    result.error.info?.code,
    TOOL_ABORTED_BEFORE_DISPATCH,
  );
  assert.equal(textOf(result), "Error: tool call aborted before dispatch");
});

test("cancellation after a successful body wins over success", async () => {
  const registry = new ToolRegistry();
  const controller = new AbortController();

  registry.register(
    makeTool("cancelled-after", {
      execute: async () => {
        controller.abort();
        return { ok: true };
      },
    }),
  );

  const result = await registry.execute(
    input("cancelled-after", { signal: controller.signal }),
  );

  assert.equal(result.isError, true);
  assert.equal(result.error.info?.code, TOOL_ABORTED);
  assert.equal(textOf(result), "Error: tool call aborted");
});

test("projectContent runs before post-execute; finalizeContent runs last", async () => {
  const registry = new ToolRegistry();
  const projected: ContentBlock[] = [{ type: "text", text: "projected" }];
  const finalized: ContentBlock[] = [{ type: "text", text: "finalized" }];
  let postSaw: ContentBlock[] = [];

  registry.register(
    makeTool("projected", {
      execute: async () => ({ ok: true }),
      projectContent: () => projected,
      finalizeContent: () => finalized,
    }),
  );
  registry.hooks.usePostExecute(async (_exec, result) => {
    postSaw = [...result.content];
    return { kind: "accept" };
  });

  const result = await registry.execute(input("projected"));

  assert.equal(result.isError, false);
  assert.deepEqual(postSaw, projected);
  assert.deepEqual(result.content, finalized);
});

test("deferContext rides the final result as additionalContexts", async () => {
  const registry = new ToolRegistry();
  const deferred = message("deferred context");

  registry.register(
    makeTool("deferring", {
      execute: async (_args, exec) => {
        exec.deferContext(deferred);
        return { ok: true };
      },
    }),
  );

  const result = await registry.execute(input("deferring"));

  assert.equal(result.isError, false);
  assert.deepEqual(result.additionalContexts, [deferred]);
});

test("concludeTurn marks only a successful result", async () => {
  const registry = new ToolRegistry();

  registry.register(
    makeTool("concluding", {
      execute: async (_args, exec) => {
        exec.concludeTurn();
        return { ok: true };
      },
    }),
  );
  registry.register(
    makeTool("concluding-failure", {
      execute: async (_args, exec) => {
        exec.concludeTurn();
        throw new Error("boom");
      },
    }),
  );

  const success = await registry.execute(input("concluding"));
  assert.equal(success.isError, false);
  assert.equal(success.concludesTurn, true);

  const failure = await registry.execute(input("concluding-failure"));
  assert.equal(failure.isError, true);
  assert.equal(failure.concludesTurn, undefined);
});

test("result observers see the frozen final result and failures are contained", async () => {
  const registry = new ToolRegistry();
  const seen: Array<Readonly<ToolExecutionResult>> = [];

  registry.register(makeTool("observed"));
  registry.onResult(() => {
    throw new Error("observer failure");
  });
  registry.onResult((exec, result) => {
    assert.ok(Object.isFrozen(exec));
    assert.ok(Object.isFrozen(result));
    seen.push(result);
  });

  const result = await registry.execute(input("observed"));

  assert.equal(result.isError, false);
  assert.equal(seen.length, 1);
  assert.equal(seen[0], result);
});

test("unknown tool and invalid arguments fail before policy", async () => {
  const registry = new ToolRegistry();
  registry.register({
    ...makeTool("strict"),
    parameters: {
      type: "object",
      properties: { requiredValue: { type: "string" } },
      required: ["requiredValue"],
      additionalProperties: false,
    },
  });

  const unknown = await registry.execute(input("missing"));
  assert.equal(unknown.isError, true);
  assert.equal(unknown.error.info?.code, "UNKNOWN_TOOL");
  assert.equal(textOf(unknown), 'Error: unknown tool "missing"');

  const invalid = await registry.execute(input("strict"));
  assert.equal(invalid.isError, true);
  assert.equal(invalid.error.info?.code, "INVALID_TOOL_ARGS");
  assert.match(invalid.error.message, /requiredValue/);
});

test("register returns a disposer and rejects duplicate names", () => {
  const registry = new ToolRegistry();
  const tool = makeTool("a");

  const dispose = registry.register(tool);
  assert.equal(registry.get("a"), tool);
  assert.throws(
    () => registry.register(makeTool("a")),
    /already registered/,
  );

  dispose();
  assert.equal(registry.get("a"), undefined);
  // Idempotent.
  dispose();
  assert.equal(registry.get("a"), undefined);
});

test("restrict allow and deny layers intersect; undo removes only its layer", () => {
  const registry = new ToolRegistry();
  const a = makeTool("a");
  const b = makeTool("b");
  registry.register(a);
  registry.register(b);
  registry.register(makeTool("c"));

  const undoAllow = registry.restrict("preset", { allow: ["a", "b"] });
  const undoDeny = registry.restrict("preset", { deny: ["b"] });

  assert.deepEqual(
    registry.list("preset").map((tool) => tool.name),
    ["a"],
  );
  assert.deepEqual(
    registry.schemas("preset").map((schema) => schema.name),
    ["a"],
  );
  assert.equal(registry.get("b", "preset"), undefined);
  assert.equal(registry.get("b", "other"), b);

  undoDeny();
  assert.deepEqual(
    registry.list("preset").map((tool) => tool.name),
    ["a", "b"],
  );

  undoAllow();
  assert.deepEqual(
    registry.list("preset").map((tool) => tool.name),
    ["a", "b", "c"],
  );

  // Idempotent.
  undoAllow();
  assert.deepEqual(
    registry.list("preset").map((tool) => tool.name),
    ["a", "b", "c"],
  );
});

test("restrict rejects empty and unknown filters", () => {
  const registry = new ToolRegistry();
  registry.register(makeTool("a"));

  assert.throws(
    () => registry.restrict("preset", {}),
    /allow.*deny|requires/,
  );
  assert.throws(
    () => registry.restrict("preset", { allow: ["missing"] }),
    /unknown global tool/,
  );
});

test("an empty allow filter leaves the scope with no tools", () => {
  const registry = new ToolRegistry();
  registry.register(makeTool("a"));
  registry.register(makeTool("b"));

  const undo = registry.restrict("empty", { allow: [] });

  assert.deepEqual(registry.list("empty"), []);
  assert.equal(registry.get("a", "empty"), undefined);
  assert.deepEqual(
    registry.list().map((tool) => tool.name),
    ["a", "b"],
  );

  undo();
  assert.deepEqual(
    registry.list("empty").map((tool) => tool.name),
    ["a", "b"],
  );
});

test("onChange fires for register, restrict, disposer, and undo until stopped", () => {
  const registry = new ToolRegistry();
  let calls = 0;
  const stop = registry.onChange(() => {
    calls += 1;
  });

  const dispose = registry.register(makeTool("a"));
  assert.equal(calls, 1);

  const undo = registry.restrict("preset", { allow: ["a"] });
  assert.equal(calls, 2);

  undo();
  assert.equal(calls, 3);

  dispose();
  assert.equal(calls, 4);

  stop();
  registry.register(makeTool("b"));
  assert.equal(calls, 4);
});

test("a throwing onChange listener does not break other listeners or mutations", () => {
  const registry = new ToolRegistry();
  let calls = 0;
  const stopBad = registry.onChange(() => {
    throw new Error("listener failure");
  });
  const stopGood = registry.onChange(() => {
    calls += 1;
  });

  registry.register(makeTool("a"));

  assert.equal(calls, 1);
  assert.deepEqual(
    registry.list().map((tool) => tool.name),
    ["a"],
  );

  stopBad();
  stopGood();
});

test("schemas project only model-facing fields", () => {
  const registry = new ToolRegistry();
  registry.register(
    makeTool("projected-schema", {
      timeoutMs: 1000,
      isConcurrencySafe: () => true,
    }),
  );

  const [schema] = registry.schemas();
  assert.ok(schema !== undefined);
  assert.deepEqual(
    Object.keys(schema).sort(),
    ["description", "name", "parameters"],
  );
});

test("executionMode is parallel only for an exact true classifier", () => {
  const registry = new ToolRegistry();
  registry.register(
    makeTool("safe", {
      isConcurrencySafe: (args) =>
        (args as { ok?: boolean }).ok === true,
    }),
  );
  registry.register(makeTool("unsafe", { isConcurrencySafe: () => false }));
  registry.register(makeTool("undeclared"));
  registry.register(
    makeTool("throws", {
      isConcurrencySafe: () => {
        throw new Error("classifier failure");
      },
    }),
  );

  assert.deepEqual(
    registry.executionMode(input("safe", { arguments: { ok: true } })),
    { kind: "parallel" },
  );
  assert.deepEqual(
    registry.executionMode(input("safe", { arguments: { ok: false } })),
    { kind: "exclusive" },
  );
  assert.deepEqual(
    registry.executionMode(input("unsafe", { arguments: {} })),
    { kind: "exclusive" },
  );
  assert.deepEqual(
    registry.executionMode(input("undeclared", { arguments: {} })),
    { kind: "exclusive" },
  );
  assert.deepEqual(
    registry.executionMode(input("throws", { arguments: {} })),
    { kind: "exclusive" },
  );
  assert.deepEqual(
    registry.executionMode(input("missing", { arguments: {} })),
    { kind: "exclusive" },
  );
});

test("executionMode classifies through the call's scope", () => {
  const registry = new ToolRegistry();
  registry.register(makeTool("safe", { isConcurrencySafe: () => true }));

  assert.deepEqual(
    registry.executionMode(
      input("safe", { arguments: {}, scope: "ad-manager" }),
    ),
    { kind: "parallel" },
  );

  registry.restrict("ad-manager", { deny: ["safe"] });

  assert.deepEqual(
    registry.executionMode(
      input("safe", { arguments: {}, scope: "ad-manager" }),
    ),
    { kind: "exclusive" },
  );
  assert.deepEqual(
    registry.executionMode(
      input("safe", { arguments: {}, scope: "ad-strategist" }),
    ),
    { kind: "parallel" },
  );
});

test("hooks cannot be bypassed by a direct registry execution", async () => {
  const registry = new ToolRegistry();
  let preExecuted = false;

  registry.register(makeTool("hooked"));
  registry.hooks.usePreExecute(async (_exec, next) => {
    preExecuted = true;
    return next();
  });

  const result = await registry.execute(input("hooked"));

  assert.equal(result.isError, false);
  assert.equal(preExecuted, true);
});
