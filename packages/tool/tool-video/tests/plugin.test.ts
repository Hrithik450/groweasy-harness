import test from "node:test";
import assert from "node:assert/strict";

import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition } from "@openai-harness/tools";

import { apply, formatAssTime, inject, name } from "../src/index";

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

test("tool-video declares the tools injection", () => {
  assert.equal(name, "tool-video");
  assert.deepEqual(inject, ["tools"]);
});

test("apply registers the full video tool family on ctx.tools", () => {
  const { names, ctx } = captureContext();
  apply(ctx);
  assert.deepEqual(names.sort(), [
    "createSubtitles",
    "imageToVideo",
    "readVideos",
    "syncLips",
  ]);
});

test("the moved subtitle helpers format ASS timestamps", () => {
  assert.equal(formatAssTime(0), "0:00:00.00");
  assert.equal(formatAssTime(65.5), "0:01:05.50");
});
