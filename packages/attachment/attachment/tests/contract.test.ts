import test from "node:test";
import assert from "node:assert/strict";

import { Context } from "@deepseek-ai/cordis";

import {
  AttachmentError,
  AttachmentId,
  AttachmentStore,
  DEFAULT_IMAGE_LIMITS,
  isAttachmentError,
  isImageAdmissionError,
  type ImageAttachmentLimits,
  type ImageAttachmentRef,
  type SaveImageAttachment,
  type StoredAttachment,
} from "../src/index";

class FakeStore extends AttachmentStore {
  readonly imageLimits: ImageAttachmentLimits = DEFAULT_IMAGE_LIMITS;
  readonly saved: SaveImageAttachment[] = [];
  readonly read: ImageAttachmentRef[] = [];
  failOn?: number;

  constructor(ctx: Context) {
    super(ctx);
  }

  async validateImage(input: SaveImageAttachment): Promise<void> {
    if (input.data.byteLength === 0) {
      throw new AttachmentError("Image is empty.", "IMAGE_CORRUPTED");
    }
  }

  async saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    this.saved.push(input);
    return {
      attachmentId: AttachmentId("sha256:" + "a".repeat(64)),
      mediaType: input.mediaType,
      bytes: input.data.byteLength,
      width: 1,
      height: 1,
    };
  }

  async readImage(
    ref: ImageAttachmentRef,
  ): Promise<StoredAttachment<ImageAttachmentRef>> {
    this.read.push(ref);
    return { ref, data: new Uint8Array([1, 2, 3]) };
  }
}

function image(byte: number): SaveImageAttachment {
  return { data: new Uint8Array([byte]), mediaType: "image/png", name: "x.png" };
}

test("the store registers itself as ctx.attachments", () => {
  const ctx = new Context();
  const store = new FakeStore(ctx);
  // Cordis exposes the registered service through a context proxy, so the
  // instance is identified by its service name and prototype.
  assert.equal(ctx.attachments.name, "attachments");
  assert.ok(ctx.attachments instanceof FakeStore);
  assert.equal(store.name, "attachments");
});

test("a second store on the same context is rejected", () => {
  const ctx = new Context();
  new FakeStore(ctx);
  assert.throws(() => new FakeStore(ctx), /attachments/);
});

test("saveImages validates every member before committing any member", async () => {
  const ctx = new Context();
  const store = new FakeStore(ctx);

  await assert.rejects(
    store.saveImages([image(1), { ...image(2), data: new Uint8Array() }]),
    (error: unknown) =>
      error instanceof AttachmentError && error.code === "IMAGE_CORRUPTED",
  );
  assert.equal(store.saved.length, 0);
});

test("saveImages commits members in input order", async () => {
  const ctx = new Context();
  const store = new FakeStore(ctx);
  const refs = await store.saveImages([image(1), image(2)]);
  assert.deepEqual(
    refs.map((ref) => ref.bytes),
    [1, 1],
  );
  assert.deepEqual(
    store.saved.map((input) => input.data[0]),
    [1, 2],
  );
});

test("batch count limits are enforced before validation or storage", async () => {
  const ctx = new Context();
  const store = new FakeStore(ctx);
  const inputs = Array.from(
    { length: DEFAULT_IMAGE_LIMITS.maxImagesPerMessage + 1 },
    () => image(1),
  );
  await assert.rejects(
    store.saveImages(inputs),
    (error: unknown) =>
      error instanceof AttachmentError && error.code === "TOO_MANY_IMAGES",
  );
  assert.equal(store.saved.length, 0);
});

test("admitEncodedFile enforces canonical base64 and accepts an empty file", async () => {
  const ctx = new Context();
  const store = new FakeStore(ctx);
  const saved: Uint8Array[] = [];
  store.saveFile = async (input) => {
    saved.push(input.data);
    return {
      attachmentId: AttachmentId("sha256:" + "b".repeat(64)),
      name: input.name ?? "file",
      bytes: input.data.byteLength,
    };
  };

  await store.admitEncodedFile({ data: "" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.byteLength, 0);

  await assert.rejects(
    store.admitEncodedFile({ data: "not base64!" }),
    (error: unknown) =>
      error instanceof AttachmentError && error.code === "INVALID_FILE_BASE64",
  );
});

test("unsupported video and projection operations reject with a stable code", async () => {
  const ctx = new Context();
  const store = new FakeStore(ctx);
  const ref: ImageAttachmentRef = {
    attachmentId: AttachmentId("sha256:" + "c".repeat(64)),
    mediaType: "image/png",
    bytes: 1,
    width: 1,
    height: 1,
  };

  await assert.rejects(store.saveVideo({ data: new Uint8Array(), mediaType: "video/mp4" }), {
    code: "STORAGE_UNSUPPORTED",
  });
  await assert.rejects(
    store.readImageRequest(ref, { width: 10, height: 10, maxBytes: 100 }),
    { code: "STORAGE_UNSUPPORTED" },
  );
});

test("attachment failures are recognized structurally across package copies", () => {
  const error = new Error("corrupt") as Error & { code: string };
  error.code = "IMAGE_CORRUPTED";
  assert.equal(isAttachmentError(error), true);
  assert.equal(isImageAdmissionError(error), true);

  const foreign = new Error("nope");
  assert.equal(isAttachmentError(foreign), false);
  const unknownCode = new Error("other") as Error & { code: string };
  unknownCode.code = "SOMETHING_ELSE";
  assert.equal(isAttachmentError(unknownCode), false);
});
