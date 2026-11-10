import test from "node:test";
import assert from "node:assert/strict";

import { requireAgentLoopHost } from "@openai-harness/agent-loop";
import { configureAgentLoopHost } from "../src/agent-loop";

test("the loop host puts the compiled system prompt first", () => {
  configureAgentLoopHost();

  const messages = requireAgentLoopHost().deriveMessages([], "SYSTEM RULES");

  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.role, "system");
  assert.equal(messages[0]!.content, "SYSTEM RULES");
});
