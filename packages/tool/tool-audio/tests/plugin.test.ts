import test from "node:test";
import assert from "node:assert/strict";

import type { Context } from "@deepseek-ai/cordis";
import type { ToolDefinition } from "@openai-harness/tools";

import {
  apply,
  DEFAULT_VOICE_ID,
  inject,
  name,
  resolveVoiceId,
} from "../src/index";

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

test("tool-audio declares the tools injection", () => {
  assert.equal(name, "tool-audio");
  assert.deepEqual(inject, ["tools"]);
});

test("apply registers the full audio tool family on ctx.tools", () => {
  const { names, ctx } = captureContext();
  apply(ctx);
  assert.deepEqual(names.sort(), [
    "convertAccent",
    "dubAudio",
    "generateAudio",
    "listVoiceCatalog",
  ]);
});

test("the moved voice catalog resolves catalog keys and falls back", () => {
  assert.equal(resolveVoiceId("karan"), "1pAo3XuopqND1XIDGKB4");
  assert.equal(resolveVoiceId("Shivraj"), "6OWR66phKIqiCowCgr7X");
  assert.equal(resolveVoiceId(""), DEFAULT_VOICE_ID);
});
