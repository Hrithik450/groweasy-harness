import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageId, type Message, type ModelFrame } from "@openai-harness/llm";
import {
  DeepSeekAdapter,
  createDeepSeekChatDriver,
  type DeepSeekDependencies,
} from "../src/adapter";
import type { DeepSeekClient } from "../src/client";
import type { ResolvedDeepSeekOptions } from "../src/config";

const ENV_KEYS = ["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"];

/** Run `fn` with only the listed environment variables overridden. */
async function withEnv<T>(
  values: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const userMessage: Message = {
  id: MessageId("user-1"),
  role: "user",
  content: [{ type: "text", text: "hello" }],
};

/**
 * Build a fake OpenAI-compatible client whose completion stream is fixed.
 * @param chunks - wire chunks the stream should yield.
 * @param onRequest - receives the request passed to chat.completions.create.
 * @returns a client satisfying the adapter's structural use.
 */
function fakeClient(
  chunks: unknown[],
  onRequest?: (request: unknown) => void,
): DeepSeekClient {
  return {
    chat: {
      completions: {
        create: async (request: unknown) => {
          onRequest?.(request);
          async function* stream(): AsyncIterable<unknown> {
            for (const chunk of chunks) yield chunk;
          }
          return stream();
        },
      },
    },
  } as unknown as DeepSeekClient;
}

test("DeepSeekAdapter streams canonical frames for the resolved model", async () => {
  await withEnv({ DEEPSEEK_API_KEY: "sk-test" }, async () => {
    let resolved: ResolvedDeepSeekOptions | undefined;
    let request: unknown;
    const adapter = new DeepSeekAdapter({
      createClient: (options) => {
        resolved = options;
        return fakeClient(
          [
            { choices: [{ delta: { content: "hi" } }] },
            { choices: [{ delta: {}, finish_reason: "stop" }] },
          ],
          (next) => {
            request = next;
          },
        );
      },
    });

    const frames: ModelFrame[] = [];
    for await (const frame of adapter.stream({ messages: [userMessage] })) {
      frames.push(frame);
    }

    assert.deepEqual(resolved, {
      apiKey: "sk-test",
      baseURL: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    assert.equal(
      (request as { model: string }).model,
      "deepseek-chat",
    );
    assert.deepEqual(frames, [
      { type: "text-delta", delta: "hi" },
      { type: "done", finishReason: "stop" },
    ]);
  });
});

test("DeepSeekAdapter fails clearly without an API key", async () => {
  await withEnv({}, async () => {
    const adapter = new DeepSeekAdapter();
    await assert.rejects(
      async () => {
        for await (const _frame of adapter.stream({ messages: [userMessage] })) {
          // No frame is expected.
        }
      },
      /DeepSeek API key is missing or not configured/,
    );
  });
});

test("createDeepSeekChatDriver accepts host dependencies", async () => {
  const dependencies: DeepSeekDependencies = {
    config: { apiKey: "sk-config", model: "config-model" },
    createClient: () => fakeClient([]),
  };
  const driver = createDeepSeekChatDriver(dependencies);
  const frames: ModelFrame[] = [];
  for await (const frame of driver.stream({ messages: [userMessage] })) {
    frames.push(frame);
  }
  assert.deepEqual(frames, [{ type: "done", finishReason: null }]);
});
