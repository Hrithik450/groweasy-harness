import test from "node:test";
import assert from "node:assert/strict";

import { ToolCallId } from "@openai-harness/llm";
import type { ToolRunContext } from "@openai-harness/tools";

import { createSkillTool } from "../src/index";

const NEVER_ABORTED = new AbortController().signal;

function context(overrides: Partial<ToolRunContext> = {}): ToolRunContext {
  return {
    callId: ToolCallId("call-1"),
    name: "skill",
    arguments: {},
    signal: NEVER_ABORTED,
    deferContext() {},
    concludeTurn() {},
    ...overrides,
  };
}

test("skill tool returns the resolved body and records the fetch", async () => {
  const fetched: { sessionId?: string; name: string }[] = [];
  const tool = createSkillTool({
    registry: {
      get: async () => ({
        name: "alpha-skill",
        description: "Alpha.",
        invocation: { modelInvocable: true, userInvocable: true },
        source: "custom",
        provider: "bundled",
        content: "Do the alpha work.",
      }),
    },
    onFetched: (contextValue, name) =>
      fetched.push({ sessionId: contextValue.sessionId, name }),
  });

  const value = await tool.execute(
    { name: "alpha-skill" },
    context({
      agent: {
        session: {
          id: "session-1",
          userId: "user-1",
          header: { version: 1, id: "session-1", createdAt: 0 },
        },
      } as unknown as ToolRunContext["agent"],
    }),
  );

  assert.deepEqual(value, {
    name: "alpha-skill",
    provider: "bundled",
    content: "Do the alpha work.",
  });
  assert.deepEqual(fetched, [{ sessionId: "session-1", name: "alpha-skill" }]);
});

test("skill tool rejects invalid names before lookup", async () => {
  let lookups = 0;
  const tool = createSkillTool({
    registry: {
      get: async () => {
        lookups += 1;
        return undefined;
      },
    },
  });

  await assert.rejects(
    () => tool.execute({ name: "Invalid_Skill" }, context()),
    /invalid skill name/,
  );
  assert.equal(lookups, 0);
});

test("skill tool output schema declares provider and a resourceBase union", () => {
  const tool = createSkillTool({ registry: { get: async () => undefined } });
  const schema = tool.output.schema;
  assert.deepEqual([...(schema.required ?? [])].sort(), [
    "content",
    "name",
    "provider",
  ]);
  assert.ok(schema.properties?.resourceBase?.oneOf !== undefined);
  assert.equal(schema.properties?.resourceBase?.oneOf?.length, 3);
  const serialized = JSON.stringify(schema);
  assert.ok(serialized.includes('"directory"'));
  assert.ok(serialized.includes('"url"'));
  assert.ok(serialized.includes('"opaque"'));
});

test("skill tool returns the provider and resource base", async () => {
  const resourceBase = { kind: "directory" as const, path: "/tmp/tool-skill" };
  const tool = createSkillTool({
    registry: {
      get: async () => ({
        name: "tool-skill",
        description: "Tool-visible skill.",
        invocation: { modelInvocable: true, userInvocable: true },
        source: "custom",
        provider: "bundled",
        resourceBase,
        content: "Tool body.",
      }),
    },
  });

  const value = await tool.execute({ name: "tool-skill" }, context());
  assert.deepEqual(value, {
    name: "tool-skill",
    provider: "bundled",
    resourceBase,
    content: "Tool body.",
  });
});

test("skill tool rejects unknown and non-model-invocable skills", async () => {
  const missing = createSkillTool({
    registry: { get: async () => undefined },
  });
  await assert.rejects(
    () => missing.execute({ name: "alpha-skill" }, context()),
    /unknown or not available/,
  );

  const hidden = createSkillTool({
    registry: {
      get: async () => ({
        name: "alpha-skill",
        description: "Alpha.",
        invocation: { modelInvocable: false, userInvocable: true },
        source: "custom",
        provider: "bundled",
        content: "Hidden.",
      }),
    },
  });
  await assert.rejects(
    () => hidden.execute({ name: "alpha-skill" }, context()),
    /unknown or not available/,
  );
});
