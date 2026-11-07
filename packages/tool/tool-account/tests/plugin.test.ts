import test from "node:test";
import assert from "node:assert/strict";

import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition } from "@openai-harness/tools";

import { apply, inject, name } from "../src/index";

/** Minimal context capturing what the plugin registers. */
function captureContext(): { names: string[]; ctx: Context } {
  const names: string[] = [];
  const ctx = {
    tools: {
      register(tool: ToolDefinition): () => void {
        names.push(tool.name);
        return () => {};
      },
    },
  } as unknown as Context;
  return { names, ctx };
}

test("tool-account declares the tools injection", () => {
  assert.equal(name, "tool-account");
  assert.deepEqual(inject, ["tools"]);
});

test("apply registers the full account tool family on ctx.tools", () => {
  const { names, ctx } = captureContext();
  apply(ctx);
  assert.deepEqual(names.sort(), [
    "fetchBusinessProfile",
    "saveBusinessProfile",
    "saveReport",
    "updateAlerts",
    "updateCampaigns",
    "updateSuggestions",
  ]);
});
