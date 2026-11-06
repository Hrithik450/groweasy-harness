# @openai-harness/attachment-r2

Cloudflare R2 (S3-compatible) backend for the durable attachment service
(`ctx.attachments`). Objects are content-addressed, tenant-scoped by the
namespace the host supplies, and read back with digest verification.

What it owns:
- `R2AttachmentStore`, the `AttachmentStore` implementation mounted as
  `ctx.attachments`;
- `Config` and the `R2AttachmentStore.Config` schemastery schema: bucket,
  credentials, namespace, CDN base URL, endpoint override, and image admission
  limits. The host resolves these from its own environment; this package has
  no environment access;
- image validation, orientation/normalization, and deterministic request-image
  variants with an ephemeral derived-bytes cache;
- verbatim file writes and verified streamed reads;
- R2-only delivery helpers: `headAttachment`, `openAttachmentObject`,
  `deleteAttachment`, `createPresignedUploadUrl`, and `getPublicUrl`;
- the tenant registry and deployment binder: `assertTenantId`,
  `tenantNamespace`, `r2ConfigFromEnv`, `createR2StoreFromEnv`,
  `attachmentStoreFor`, and `setAttachmentStoreFactoryForTesting`;
- the host-facing facade: upload receipts, media sniffing, reference
  resolution, scratch materialization, and canonical delivery URLs
  (`saveAttachment`, `materializeAttachment`, `resolveImageRef`, and peers);
- `createR2Client`, `EphemeralRequestCache`, `normalizeNamespace`, and the
  `R2AttachmentHead`, `R2StreamedObject`, and `PresignedUploadResult` types.

What it does not own:
- `AttachmentStore`, its admission contract, references, and error codes —
  those live in `@openai-harness/attachment`;
- the authenticated `/api/attachments/**` and `/api/download` routes — those
  stay in the host application.

Usage:

```ts
const ctx = new Context();
await ctx.plugin(R2AttachmentStore, {
  accountId,
  accessKeyId,
  secretAccessKey,
  bucketName,
  namespace: `openai-harness/t/${tenantId}`,
});
const ref = await ctx.attachments.saveImage({ data, mediaType: "image/png" });
```

Or construct directly when the host already owns the context:

```ts
const store = new R2AttachmentStore(ctx, config);
```

Source reference: this is the repository's existing R2 driver, moved out of
`src/lib/attachments/drivers/r2` and reshaped to the reference
deepseek-harness backend-package pattern (service + resolved `Config`).
