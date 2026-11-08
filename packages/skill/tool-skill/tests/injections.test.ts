import test from "node:test";
import assert from "node:assert/strict";

import { MessageId, type UserMessage } from "@openai-harness/llm";
import { SkillRegistry } from "@openai-harness/skill";

import {
  configureSkillPreStep,
  createSkillPreStepMiddleware,
  extractInvokedSkillNames,
  skillPreStepMiddleware,
  type SkillSessionLog,
} from "../src/index";

function userMessage(
  text: string,
  source: UserMessage["source"] = { kind: "user" },
): UserMessage {
  return {
    id: MessageId(`msg-${Math.random().toString(36).slice(2)}`),
    role: "user",
    content: [{ type: "text", text }],
    source,
  };
}

function makeSession(
  messages: readonly UserMessage[],
  scope?: string,
): SkillSessionLog {
  return {
    header: { agentPreset: scope },
    events: messages.map((message) => ({ type: "user/message", data: message })),
  };
}

function findCatalog(messages: readonly UserMessage[]): UserMessage | undefined {
  return messages.find((message) => message.source?.kind === "skill-catalog");
}

function findInvocation(messages: readonly UserMessage[]): UserMessage | undefined {
  return messages.find(
    (message) => message.source?.kind === "skill-invocation",
  );
}

function readCatalogSource(message: UserMessage | undefined): {
  update?: true;
  entries: readonly { name: string; description: string }[];
} | undefined {
  const source = message?.source;
  if (source?.kind !== "skill-catalog") return undefined;
  const record = source as { update?: unknown; entries?: unknown };
  if (!Array.isArray(record.entries)) return undefined;
  const entries: { name: string; description: string }[] = [];
  for (const entry of record.entries) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const { name, description } = entry as {
      name?: unknown;
      description?: unknown;
    };
    if (typeof name !== "string" || typeof description !== "string") {
      return undefined;
    }
    entries.push({ name, description });
  }
  return {
    ...(record.update === true ? { update: true as const } : {}),
    entries,
  };
}

test("catalog injection is gated by skill-tool visibility", async () => {
  const registry = new SkillRegistry();
  const scope = "catalog-gating-scope";
  registry.register(
    {
      name: "gated-skill",
      description: "Visible only when the skill tool is visible.",
      content: "Gated body.",
    },
    { scope },
  );

  let visible = false;
  const middleware = createSkillPreStepMiddleware({
    registry,
    isSkillToolVisible: () => visible,
  });
  const input = {
    claimed: [userMessage("hello")],
    turn: 1,
    step: 1,
    session: makeSession([userMessage("hello")], scope),
  };

  assert.equal(findCatalog((await middleware(input)).messages), undefined);
  visible = true;
  assert.ok(findCatalog((await middleware(input)).messages) !== undefined);
});

test("catalog caps descriptions at 500 characters and republishes only on digest change", async () => {
  const registry = new SkillRegistry();
  const scope = "catalog-digest-scope";
  const longDescription = "x".repeat(620);
  registry.register(
    {
      name: "long-description-skill",
      description: longDescription,
      content: "Long body.",
    },
    { scope },
  );
  registry.register(
    {
      name: "short-description-skill",
      description: "Short.",
      content: "Short body.",
    },
    { scope },
  );

  const middleware = createSkillPreStepMiddleware({
    registry,
    isSkillToolVisible: () => true,
  });
  const claimed = userMessage("show me skills");

  const first = await middleware({
    claimed: [claimed],
    turn: 1,
    step: 1,
    session: makeSession([claimed], scope),
  });
  const firstCatalog = findCatalog(first.messages);
  const firstSource = readCatalogSource(firstCatalog);
  assert.ok(firstSource !== undefined);
  const longEntry = firstSource.entries.find(
    (entry) => entry.name === "long-description-skill",
  );
  assert.equal(longEntry?.description.length, 500);
  assert.equal(firstSource.update, undefined);

  const second = await middleware({
    claimed: [claimed],
    turn: 1,
    step: 2,
    session: makeSession([claimed, firstCatalog as UserMessage], scope),
  });
  assert.equal(findCatalog(second.messages), undefined);
  assert.deepEqual(second.messages, [claimed]);

  registry.register(
    {
      name: "new-skill",
      description: "Newly available.",
      content: "New body.",
    },
    { scope },
  );
  const third = await middleware({
    claimed: [claimed],
    turn: 1,
    step: 3,
    session: makeSession([claimed, firstCatalog as UserMessage], scope),
  });
  const update = readCatalogSource(findCatalog(third.messages));
  assert.ok(update !== undefined);
  assert.equal(update.update, true);
  assert.ok(update.entries.some((entry) => entry.name === "new-skill"));
});

test("user gestures inject skill bodies after the catalog, user-sourced only", async () => {
  const registry = new SkillRegistry();
  const scope = "invocation-scope";
  registry.register(
    {
      name: "invoked-skill",
      description: "Invoked by gesture.",
      content: "Invoked body.",
    },
    { scope },
  );

  const middleware = createSkillPreStepMiddleware({
    registry,
    isSkillToolVisible: () => true,
  });
  const claimed = userMessage("please run /invoked-skill now");
  const result = await middleware({
    claimed: [claimed],
    turn: 1,
    step: 1,
    session: makeSession([claimed], scope),
  });

  const catalog = findCatalog(result.messages);
  const invocation = findInvocation(result.messages);
  assert.ok(catalog !== undefined);
  assert.ok(invocation !== undefined);
  assert.equal(invocation.source?.kind, "skill-invocation");
  if (invocation.source?.kind !== "skill-invocation") return;
  assert.equal(invocation.source.name, "invoked-skill");
  assert.equal(invocation.source.form, "instructions");
  assert.ok(
    result.messages.indexOf(invocation) > result.messages.indexOf(catalog),
  );
  assert.ok(invocation.content[0]?.type === "text");
  if (invocation.content[0]?.type === "text") {
    assert.ok(invocation.content[0].text.includes("<skill_content"));
    assert.ok(invocation.content[0].text.includes("Invoked body."));
  }

  const agentSourced = userMessage("please run /invoked-skill now", {
    kind: "agent",
    agentId: "other",
  });
  const ignored = await middleware({
    claimed: [agentSourced],
    turn: 1,
    step: 1,
    session: makeSession([agentSourced], scope),
  });
  assert.equal(findInvocation(ignored.messages), undefined);
});

test("gesture resolution skips skills that are not user-invocable", async () => {
  const registry = new SkillRegistry();
  const scope = "user-disabled-scope";
  registry.register(
    {
      name: "model-only-skill",
      description: "Model only.",
      invocation: { modelInvocable: true, userInvocable: false },
      content: "Model body.",
    },
    { scope },
  );

  const middleware = createSkillPreStepMiddleware({
    registry,
    isSkillToolVisible: () => true,
  });
  const claimed = userMessage("run /model-only-skill");
  const result = await middleware({
    claimed: [claimed],
    turn: 1,
    step: 1,
    session: makeSession([claimed], scope),
  });
  assert.equal(findInvocation(result.messages), undefined);
});

test("extractInvokedSkillNames parses word-bounded gestures from user messages only", () => {
  const user = userMessage(
    "Please run /competitor-research and /competitor-research now. Not /usr/bin or 5/8.",
  );
  const agent = userMessage("run /competitor-research", {
    kind: "agent",
    agentId: "other",
  });

  assert.deepEqual(extractInvokedSkillNames([user, agent]), [
    "competitor-research",
  ]);
});

test("configureSkillPreStep binds and unbinds the default middleware", async () => {
  configureSkillPreStep(undefined);
  const input = {
    claimed: [userMessage("hello")],
    turn: 1,
    step: 1,
    session: makeSession([userMessage("hello")]),
  };
  await assert.rejects(
    () => skillPreStepMiddleware(input),
    /call configureSkillPreStep/,
  );

  const registry = new SkillRegistry();
  registry.register({
    name: "bound-skill",
    description: "Bound.",
    content: "Bound body.",
  });
  configureSkillPreStep({
    registry,
    isSkillToolVisible: () => true,
  });
  try {
    const result = await skillPreStepMiddleware(input);
    assert.ok(findCatalog(result.messages) !== undefined);
  } finally {
    configureSkillPreStep(undefined);
  }
});
