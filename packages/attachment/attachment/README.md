# @openai-harness/attachment

Durable immutable attachment seam (`ctx.attachments`): content-addressed
identities, references, admission rules, and the Cordis service contract that
storage drivers implement.

What it owns:
- `AttachmentStore`, the `Service` registered as `ctx.attachments`, with the
  admission-and-storage flow: batch validation, ordered commit, canonical
  base64 admission (`admitEncodedImages`, `admitEncodedFile`,
  `admitEncodedVideo`, `admitPromptContent`), and the unsupported-operation
  answers for providers that cannot serve a kind;
- `AttachmentId` and `ImageVariantId`, `attachmentIdToHex`, and the image,
  video, and file reference types;
- `DEFAULT_IMAGE_LIMITS`, `validateImageBatchLimits`, and the image and video
  limit types;
- `AttachmentError` with its stable codes plus `isAttachmentError` and
  `isImageAdmissionError`.

What it does not own:
- storage drivers (Cloudflare R2, S3, local disk), byte normalization, or
  public URL routes — those implement `AttachmentStore` in a backend package
  such as `@openai-harness/attachment-r2`;
- UI receipts, media sniffing, scratch materialization, and authenticated
  Next.js delivery routes — those stay in the host application;
- which backend a tenant uses and where its configuration comes from — the
  host resolves that.

Usage:

```ts
const ctx = new Context();
await ctx.plugin(R2AttachmentStore, config);
const ref = await ctx.attachments.saveImage(input);
```

Source reference: `packages/attachment/attachment` in the reference
deepseek-harness repository, kept in its `Service` + abstract-contract shape.
