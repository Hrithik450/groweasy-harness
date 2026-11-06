import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

import { Context } from "@deepseek-ai/cordis";

import {
  AttachmentError,
  AttachmentId,
  AttachmentStore,
  DEFAULT_IMAGE_LIMITS,
  admitEncodedImages,
  validateImageBatchLimits,
  type ImageAttachmentLimits,
  type ImageAttachmentRef,
  type SaveImageAttachment,
  type StoredAttachment,
} from "../src/index";

class RecordingStore extends AttachmentStore {
  readonly imageLimits: ImageAttachmentLimits = DEFAULT_IMAGE_LIMITS;
  readonly saved: SaveImageAttachment[] = [];

  constructor(ctx: Context) {
    super(ctx);
  }

  async validateImage(): Promise<void> {}

  async saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    this.saved.push(input);
    return {
      attachmentId: AttachmentId("sha256:" + "d".repeat(64)),
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 1,
      height: 1,
    };
  }

  async readImage(ref: ImageAttachmentRef): Promise<StoredAttachment<ImageAttachmentRef>> {
    return { ref, data: new Uint8Array() };
  }
}

const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");

test("admitEncodedImages decodes canonical base64 and preserves input order", async () => {
  const ctx = new Context();
  const store = new RecordingStore(ctx);
  const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff]).toString("base64");

  const refs = await admitEncodedImages(store, [
    { mediaType: "image/png", data: pngBase64, name: "a.png" },
    { mediaType: "image/jpeg", data: jpegBase64 },
  ]);

  assert.equal(refs.length, 2);
  assert.deepEqual(
    store.saved.map((input) => input.mediaType),
    ["image/png", "image/jpeg"],
  );
  assert.deepEqual([...store.saved[0]!.data], [0x89, 0x50, 0x4e, 0x47]);
});

test("admitEncodedImages rejects non-canonical base64 before saving", async () => {
  const ctx = new Context();
  const store = new RecordingStore(ctx);

  await assert.rejects(
    admitEncodedImages(store, [
      { mediaType: "image/png", data: pngBase64 },
      { mediaType: "image/png", data: "AAA" },
    ]),
    (error: unknown) =>
      error instanceof AttachmentError && error.code === "INVALID_IMAGE_BASE64",
  );
  assert.equal(store.saved.length, 0);
});

test("validateImageBatchLimits enforces the aggregate byte budget", () => {
  const limits: ImageAttachmentLimits = {
    ...DEFAULT_IMAGE_LIMITS,
    maxMessageImageBytes: 4,
    maxImageBytes: 100,
  };
  assert.throws(
    () =>
      validateImageBatchLimits(
        [
          { data: new Uint8Array(3), mediaType: "image/png" },
          { data: new Uint8Array(3), mediaType: "image/png" },
        ],
        limits,
      ),
    (error: unknown) =>
      error instanceof AttachmentError && error.code === "IMAGES_TOO_LARGE",
  );
});

test("validateImageBatchLimits enforces per-image media types and byte limits", () => {
  const pngOnly: ImageAttachmentLimits = {
    ...DEFAULT_IMAGE_LIMITS,
    mediaTypes: ["image/png"],
  };
  assert.throws(
    () =>
      validateImageBatchLimits(
        [{ data: new Uint8Array(1), mediaType: "image/jpeg" }],
        pngOnly,
      ),
    (error: unknown) =>
      error instanceof AttachmentError && error.code === "UNSUPPORTED_IMAGE_TYPE",
  );

  const small: ImageAttachmentLimits = {
    ...DEFAULT_IMAGE_LIMITS,
    maxImageBytes: 1,
  };
  assert.throws(
    () =>
      validateImageBatchLimits(
        [{ data: new Uint8Array(2), mediaType: "image/png" }],
        small,
      ),
    (error: unknown) =>
      error instanceof AttachmentError && error.code === "IMAGE_TOO_LARGE",
  );
});
