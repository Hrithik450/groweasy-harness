import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AttachmentId,
  type ImageAttachmentRef,
} from "@openai-harness/attachment";
import { MessageId } from "@openai-harness/llm";
import type { Message } from "@openai-harness/llm";
import {
  toChatCompletionRequest,
  toChatMessages,
  type ChatCompletionMessage,
} from "../src/chat-completions";
import {
  collectImageRefs,
  encodeImages,
  modelAcceptsImages,
  type EncodedImageMap,
  type EncodedRequestImage,
} from "../src/images";
import { toResponsesInput, toResponsesRequest } from "../src/responses";

const hex = "a".repeat(64);
const imageRef: ImageAttachmentRef = {
  attachmentId: AttachmentId(hex),
  mediaType: "image/png",
  bytes: 3,
  width: 100,
  height: 50,
};

const encodedImage: EncodedRequestImage = {
  mediaType: "image/png",
  base64: "QUJD",
  bytes: 3,
  width: 100,
  height: 50,
};

const dataUrl = "data:image/png;base64,QUJD";

function encodedMap(): EncodedImageMap {
  return new Map([[imageRef.attachmentId, encodedImage]]);
}

const userWithImage: Message = {
  id: MessageId("user-image"),
  role: "user",
  content: [
    { type: "text", text: "what is this?" },
    { type: "image", ref: imageRef },
  ],
};

const toolWithImage: Message = {
  role: "tool",
  toolCallId: "call_1",
  content: [
    { type: "text", text: "done" },
    { type: "image", ref: imageRef },
  ],
};

test("modelAcceptsImages recognizes OpenAI vision routes only", () => {
  assert.equal(modelAcceptsImages("gpt-4o-mini"), true);
  assert.equal(modelAcceptsImages("gpt-4.1"), true);
  assert.equal(modelAcceptsImages("gpt-5"), true);
  assert.equal(modelAcceptsImages("gpt-6.1-sol"), true);
  assert.equal(modelAcceptsImages("o3"), true);
  assert.equal(modelAcceptsImages("deepseek-chat"), false);
  assert.equal(modelAcceptsImages("unknown-model"), false);
});

test("encodeImages uses the injected loader for image models", async () => {
  let loaded = 0;
  const result = await encodeImages([userWithImage], {
    model: "gpt-4o",
    loadImage: async (ref) => {
      loaded += 1;
      assert.equal(ref.attachmentId, imageRef.attachmentId);
      return {
        data: new Uint8Array([65, 66, 67]),
        mediaType: "image/png",
        bytes: 3,
        width: 100,
        height: 50,
      };
    },
  });

  assert.equal(loaded, 1);
  assert.equal(result.get(imageRef.attachmentId)?.base64, "QUJD");
});

test("encodeImages attaches nothing for non-image models", async () => {
  let loaded = 0;
  const result = await encodeImages([userWithImage], {
    model: "deepseek-chat",
    loadImage: async () => {
      loaded += 1;
      return null;
    },
  });

  assert.equal(loaded, 0);
  assert.equal(result.size, 0);
});

test("encodeImages skips assistant images and dedupes refs", () => {
  assert.deepEqual(
    collectImageRefs(
      [
        {
          id: MessageId("assistant-image"),
          role: "assistant",
          content: [{ type: "image", ref: imageRef }],
        },
        userWithImage,
        userWithImage,
      ],
      10,
    ).map((ref) => ref.attachmentId),
    [imageRef.attachmentId],
  );
});

test("chat completions emit a user parts array for a user image", () => {
  assert.deepEqual(toChatMessages([userWithImage], encodedMap()), [
    {
      role: "user",
      content: [
        { type: "text", text: "what is this?" },
        { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
      ],
    },
  ]);
});

test("chat completions keep tool content a string and add an image user message", () => {
  const messages = toChatMessages([toolWithImage], encodedMap());
  assert.equal(messages.length, 2);

  const tool = messages[0] as Extract<ChatCompletionMessage, { role: "tool" }>;
  assert.equal(tool.role, "tool");
  assert.equal(tool.content, "done");

  const followUp = messages[1];
  assert.equal(followUp.role, "user");
  assert.ok(Array.isArray(followUp.content));
  assert.deepEqual(followUp.content, [
    {
      type: "text",
      text: '<tool-result-images call_id="call_1">1 image returned by this tool call.</tool-result-images>',
    },
    { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
  ]);
});

test("chat completions stay text-only when no image was encoded", () => {
  const request = toChatCompletionRequest({
    model: "deepseek-chat",
    messages: [userWithImage],
  });
  assert.deepEqual(request.messages, [
    {
      role: "user",
      content:
        'what is this?\n\n[Image attachment id="sha256:' + hex + '"]',
    },
  ]);
});

test("responses emit input_image parts for a user image", () => {
  assert.deepEqual(toResponsesInput([userWithImage], encodedMap()), [
    {
      role: "user",
      content: [
        { type: "input_text", text: "what is this?" },
        { type: "input_image", image_url: dataUrl, detail: "auto" },
      ],
    },
  ]);
});

test("responses never attach images to function_call_output", () => {
  const input = toResponsesInput([toolWithImage], encodedMap());
  assert.deepEqual(input[0], {
    type: "function_call_output",
    call_id: "call_1",
    output: "done",
  });

  const followUp = input[1] as { role: "user"; content: unknown[] };
  assert.equal(followUp.role, "user");
  assert.deepEqual(followUp.content, [
    {
      type: "input_text",
      text: '<tool-result-images call_id="call_1">1 image returned by this tool call.</tool-result-images>',
    },
    { type: "input_image", image_url: dataUrl, detail: "auto" },
  ]);
});

test("responses stay text-only when no image was encoded", () => {
  const request = toResponsesRequest({
    model: "deepseek-chat",
    messages: [userWithImage],
  });
  assert.deepEqual(request.input, [
    {
      role: "user",
      content:
        'what is this?\n\n[Image attachment id="sha256:' + hex + '"]',
    },
  ]);
});
