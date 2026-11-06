import test from "node:test";
import assert from "node:assert/strict";

import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition } from "@openai-harness/tools";

import { apply, IMAGE_TYPES_SLUG, imageClusters, imagePrompts, inject, name } from "../src/index";

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

test("tool-image declares the tools injection", () => {
  assert.equal(name, "tool-image");
  assert.deepEqual(inject, ["tools"]);
});

test("apply registers the full image tool family on ctx.tools", () => {
  const { names, ctx } = captureContext();
  apply(ctx);
  assert.deepEqual(names.sort(), [
    "fetchImageTypes",
    "generateImages",
    "readImages",
  ]);
});

test("the moved prompt catalog keeps every cluster and prompt set", () => {
  assert.equal(IMAGE_TYPES_SLUG.length, 6);
  assert.deepEqual(
    imageClusters.map((cluster) => cluster.slug),
    [...IMAGE_TYPES_SLUG],
  );
  for (const slug of IMAGE_TYPES_SLUG) {
    assert.ok(imagePrompts[slug].length > 0, `${slug} has no prompts`);
  }
});
