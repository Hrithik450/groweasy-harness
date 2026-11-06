/**
 * Host-facing attachment facade for the R2 backend.
 *
 * Keeps the application's upload receipts, media sniffing, reference
 * resolution, scratch materialization, and delivery URLs beside the store
 * that implements them. Durable bytes live in Cloudflare R2; only transient
 * scratch files are written to the host filesystem.
 *
 * @module @openai-harness/attachment-r2/host
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  AttachmentError,
  AttachmentId,
  attachmentIdToHex,
  type AttachmentRef,
  type FileAttachmentRef,
  type ImageAttachmentRef,
  type ImageMediaType,
} from "@openai-harness/attachment";
import { dataPath } from "./paths";
import { attachmentStoreFor, assertTenantId } from "./registry";

/**
 * UI-facing attachment receipt. `ref` is the durable, tenant-scoped identity;
 * `url` is always the authenticated application route.
 */
export interface Attachment {
  id: string;
  filename: string;
  url: string;
  bytes: number;
  mimeType: string;
  /** Retention hint only; never selects a filesystem directory or bucket prefix. */
  storage?: "tmp" | "artifact";
  seq?: number;
  ref: AttachmentRef;
  width?: number;
  height?: number;
}

/** Root for transient local materializations and the shared voice catalog. */
export const ATTACHMENTS_DIR = dataPath("attachments");
export const AUDIOS_ATTACHMENTS_DIR = path.join(ATTACHMENTS_DIR, "audios");
export const SCRATCH_ATTACHMENTS_DIR = path.join(ATTACHMENTS_DIR, "scratch");

/**
 * Single source of truth for file extension <-> MIME type mappings.
 */
export const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".ass": "text/x-ssa",
  ".srt": "text/plain",
  ".txt": "text/plain",
  ".json": "application/json",
};

export const MIME_TO_EXT: Record<string, string> = Object.entries(
  EXT_TO_MIME,
).reduce<Record<string, string>>(
  (acc, [ext, mime]) => {
    if (!acc[mime]) acc[mime] = ext === ".jpeg" ? ".jpg" : ext;
    return acc;
  },
  {
    "image/jpg": ".jpg",
    "audio/mp3": ".mp3",
    "audio/x-wav": ".wav",
    "text/ssa": ".ass",
  },
);

export function getMimeTypeFromExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] || "application/octet-stream";
}

const IMAGE_MEDIA_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export interface SaveAttachmentPayload {
  buffer: Buffer | string | AsyncIterable<Uint8Array>;
  filename?: string;
  mediaType?: string;
  mimeType?: string;
  storage?: "tmp" | "artifact";
  /** Owning tenant. Required for durable storage. */
  userId?: string;
  /** Legacy identifier; ignored because ids are content-addressed. */
  id?: string;
  seq?: number;
}

export interface SaveAttachmentOptions {
  /** Legacy identifier; ignored because ids are content-addressed. */
  id?: string;
  filename?: string;
  mimeType?: string;
  storage?: "tmp" | "artifact";
  seq?: number;
}

function isAsyncByteStream(value: unknown): value is AsyncIterable<Uint8Array> {
  return (
    !!value &&
    typeof value === "object" &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Uint8Array) &&
    Symbol.asyncIterator in value
  );
}

/** Read up to 64 bytes and return a stream that replays them. */
async function peekStream(
  stream: AsyncIterable<Uint8Array>,
): Promise<{ head: Uint8Array; stream: AsyncIterable<Uint8Array> }> {
  const iterator = stream[Symbol.asyncIterator]();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < 64) {
    const next = await iterator.next();
    if (next.done) break;
    chunks.push(next.value);
    total += next.value.byteLength;
  }

  const head = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  ).subarray(0, 64);

  async function* replay(): AsyncIterable<Uint8Array> {
    for (const chunk of chunks) yield chunk;
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      yield next.value;
    }
  }

  return { head, stream: replay() };
}

async function collectStream(
  stream: AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  );
}

function ascii(buffer: Uint8Array, start: number, end: number): string {
  return Buffer.from(buffer.subarray(start, end)).toString("ascii");
}

function startsWithAscii(buffer: Uint8Array, value: string): boolean {
  if (buffer.byteLength < value.length) return false;
  return ascii(buffer, 0, value.length) === value;
}

/**
 * Sniff the durable media type from magic bytes. Declared type and filename
 * are hints only; a recognized signature always wins.
 */
export function sniffMediaType(
  bytes: Uint8Array,
  declared?: string,
  filename?: string,
): string {
  const buffer = Buffer.from(bytes);
  const ext = path.extname(filename ?? "").toLowerCase();

  if (buffer.length >= 8 && buffer[0] === 0x89) {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.subarray(0, 8).equals(png)) return "image/png";
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    startsWithAscii(buffer, "RIFF") &&
    ascii(buffer, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    buffer.length >= 6 &&
    (startsWithAscii(buffer, "GIF87a") || startsWithAscii(buffer, "GIF89a"))
  ) {
    return "image/gif";
  }

  // ISO base media (MP4/MOV/M4A) carries its brand at byte offset 8.
  if (buffer.length >= 12 && ascii(buffer, 4, 8) === "ftyp") {
    const brand = ascii(buffer, 8, 12);
    if (brand === "qt  ") return "video/quicktime";
    if (brand === "M4A " || brand === "M4B ") return "audio/mp4";
    return "video/mp4";
  }
  // Matroska/WebM signature.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return "video/webm";
  }
  if (
    buffer.length >= 12 &&
    startsWithAscii(buffer, "RIFF") &&
    ascii(buffer, 8, 12) === "WAVE"
  ) {
    return "audio/wav";
  }
  if (
    buffer.length >= 3 &&
    (startsWithAscii(buffer, "ID3") ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0))
  ) {
    return "audio/mpeg";
  }

  const declaredText =
    declared !== undefined &&
    (declared.startsWith("text/") ||
      declared === "application/json" ||
      declared === "application/xml" ||
      declared === "image/svg+xml");
  if (declaredText) return declared;

  const extMime = EXT_TO_MIME[ext];
  if (
    extMime &&
    (extMime.startsWith("text/") ||
      extMime === "application/json" ||
      extMime === "image/svg+xml")
  ) {
    return extMime;
  }

  // Plain-text heuristic: valid UTF-8 with no NUL byte.
  if (buffer.length > 0 && !buffer.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      return "text/plain";
    } catch {
      // Not valid UTF-8.
    }
  }

  if (declared && declared.length > 0) return declared;
  return extMime ?? "application/octet-stream";
}

/** Parse a bare digest, `sha256:<hex>` id, or `/api/attachments/<id>` URL. */
export function parseAttachmentId(urlOrId: string): AttachmentId {
  const raw = (urlOrId ?? "").trim().split(/[?#]/)[0];
  let candidate = raw;
  const prefix = "/api/attachments/";
  if (candidate.startsWith(prefix)) candidate = candidate.slice(prefix.length);
  candidate = candidate.replace(/^\/+|\/+$/g, "");

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    throw new AttachmentError(
      `Invalid attachment reference: "${urlOrId}".`,
      "STORAGE_ERROR",
    );
  }

  try {
    return AttachmentId(candidate);
  } catch {
    throw new AttachmentError(
      `Invalid attachment reference: "${urlOrId}".`,
      "STORAGE_ERROR",
    );
  }
}

/** Canonical delivery URL for one durable reference. */
export function publicUrlFor(ref: AttachmentRef): string {
  return `/api/attachments/${ref.attachmentId}`;
}

interface ResolvedAttachmentMeta {
  kind: "image" | "file";
  ref: AttachmentRef;
  contentType?: string;
}

const REF_CACHE_LIMIT = 1000;
const refCache = new Map<string, ResolvedAttachmentMeta>();

function refCacheKey(tenantId: string, id: AttachmentId): string {
  return `${tenantId}:${id}`;
}

function rememberRef(
  tenantId: string,
  id: AttachmentId,
  meta: ResolvedAttachmentMeta,
): void {
  if (refCache.size >= REF_CACHE_LIMIT) {
    const oldest = refCache.keys().next().value;
    if (oldest !== undefined) refCache.delete(oldest);
  }
  refCache.set(refCacheKey(tenantId, id), meta);
}

function numericMetadata(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function decodeMetadataName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value) || undefined;
  } catch {
    return value || undefined;
  }
}

function asImageMediaType(contentType: string | undefined): ImageMediaType {
  if (
    contentType === "image/png" ||
    contentType === "image/jpeg" ||
    contentType === "image/webp" ||
    contentType === "image/gif"
  ) {
    return contentType;
  }
  return "image/jpeg";
}

async function probeAttachment(
  urlOrId: string,
  tenantId: string,
): Promise<{
  tenantId: string;
  id: AttachmentId;
  meta: ResolvedAttachmentMeta;
}> {
  const tenant = assertTenantId(tenantId);
  const id = parseAttachmentId(urlOrId);
  const cached = refCache.get(refCacheKey(tenant, id));
  if (cached) return { tenantId: tenant, id, meta: cached };

  const store = attachmentStoreFor(tenant);
  const head = await store.headAttachment(id);
  if (!head) {
    throw new AttachmentError(
      `Attachment ${id} was not found.`,
      "ATTACHMENT_NOT_FOUND",
    );
  }

  let meta: ResolvedAttachmentMeta;
  if (head.kind === "image") {
    const name = decodeMetadataName(head.metadata?.["original-name"]);
    const ref: ImageAttachmentRef = {
      attachmentId: id,
      mediaType: asImageMediaType(head.contentType),
      bytes: head.bytes ?? 0,
      width: numericMetadata(head.metadata?.width) ?? 0,
      height: numericMetadata(head.metadata?.height) ?? 0,
      ...(name ? { name } : {}),
    };
    meta = { kind: "image", ref, contentType: head.contentType };
  } else {
    const name =
      decodeMetadataName(head.metadata?.["original-name"]) ??
      `attachment-${attachmentIdToHex(id).slice(0, 12)}`;
    const ref: FileAttachmentRef = {
      attachmentId: id,
      name,
      bytes: head.bytes ?? 0,
    };
    meta = { kind: "file", ref, contentType: head.contentType };
  }

  rememberRef(tenant, id, meta);
  return { tenantId: tenant, id, meta };
}

/**
 * Resolve an attachment id or app URL into its durable reference.
 *
 * @throws {AttachmentError} `ATTACHMENT_NOT_FOUND` when this tenant does not
 *   own the object, and `STORAGE_ERROR` when the reference is malformed.
 */
export async function resolveAttachmentRef(
  urlOrId: string,
  tenantId: string,
): Promise<AttachmentRef> {
  const { meta } = await probeAttachment(urlOrId, tenantId);
  return meta.ref;
}

/**
 * Resolve an attachment id or app URL into an image reference with intrinsic
 * dimensions. Only image objects may be passed.
 */
export async function resolveImageRef(
  urlOrId: string,
  tenantId: string,
): Promise<ImageAttachmentRef> {
  const { tenantId: tenant, id, meta } = await probeAttachment(
    urlOrId,
    tenantId,
  );
  if (meta.kind !== "image") {
    throw new AttachmentError(
      `Attachment ${id} is not an image.`,
      "UNSUPPORTED_IMAGE_TYPE",
    );
  }

  const ref = meta.ref as ImageAttachmentRef;
  if (ref.width > 0 && ref.height > 0) return ref;

  // Legacy objects may predate stored dimensions; derive them once.
  const stored = await attachmentStoreFor(tenant).readImage(ref);
  const info = await sharp(stored.data).metadata();
  const enriched: ImageAttachmentRef = {
    ...ref,
    width: info.width ?? ref.width,
    height: info.height ?? ref.height,
  };
  rememberRef(tenant, id, { ...meta, ref: enriched });
  return enriched;
}

function sanitizeExtension(ext: string): string {
  const normalized = ext.toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(normalized) ? normalized : "";
}

function extensionFor(meta: ResolvedAttachmentMeta): string {
  if (meta.kind === "image") {
    const mediaType = (meta.ref as ImageAttachmentRef).mediaType;
    return sanitizeExtension(MIME_TO_EXT[mediaType] ?? "") || ".img";
  }
  const nameExt = sanitizeExtension(path.extname((meta.ref as FileAttachmentRef).name));
  if (nameExt) return nameExt;
  const contentType = meta.contentType ?? "";
  return sanitizeExtension(MIME_TO_EXT[contentType] ?? "") || ".bin";
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const SCRATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const lastSweepByTenant = new Map<string, number>();

async function sweepScratch(tenantId: string, dir: string): Promise<void> {
  const last = lastSweepByTenant.get(tenantId) ?? 0;
  if (Date.now() - last < SWEEP_INTERVAL_MS) return;
  lastSweepByTenant.set(tenantId, Date.now());

  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const cutoff = Date.now() - SCRATCH_MAX_AGE_MS;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const target = path.join(dir, entry.name);
      try {
        const stat = await fs.promises.stat(target);
        if (stat.mtimeMs < cutoff) {
          await fs.promises.rm(target, { force: true });
        }
      } catch {
        // Best-effort cleanup only.
      }
    }
  } catch {
    // Best-effort cleanup only.
  }
}

/** Ensure and return the per-tenant local scratch directory. */
export async function ensureTenantScratchDir(
  tenantId: string,
): Promise<string> {
  const dir = path.join(SCRATCH_ATTACHMENTS_DIR, assertTenantId(tenantId));
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Materialize an attachment as a real local file for tools that require one
 * (ffmpeg, ffprobe, whisper, lip-sync). The scratch cache is keyed by the
 * content hash and extension, so repeated calls do not re-download.
 */
export async function materializeAttachment(
  urlOrId: string,
  tenantId: string,
): Promise<string> {
  const tenant = assertTenantId(tenantId);
  const { id, meta } = await probeAttachment(urlOrId, tenant);
  const hash = attachmentIdToHex(id);
  const dir = await ensureTenantScratchDir(tenant);
  const target = path.join(dir, `${hash}${extensionFor(meta)}`);
  const expectedBytes = meta.ref.bytes;

  try {
    const stat = await fs.promises.stat(target);
    if (
      stat.isFile() &&
      (expectedBytes <= 0 || stat.size === expectedBytes)
    ) {
      void sweepScratch(tenant, dir);
      return target;
    }
  } catch {
    // Not cached yet.
  }

  const store = attachmentStoreFor(tenant);
  const temp = `${target}.${process.pid}.${Date.now()}.part`;

  try {
    if (meta.kind === "image") {
      const stored = await store.readImage(meta.ref as ImageAttachmentRef);
      await fs.promises.writeFile(temp, stored.data);
    } else {
      const handle = await fs.promises.open(temp, "w");
      try {
        for await (const chunk of store.readFileStream(
          meta.ref as FileAttachmentRef,
        )) {
          await handle.write(chunk);
        }
      } finally {
        await handle.close();
      }
    }
    await fs.promises.rename(temp, target);
  } catch (error) {
    await fs.promises.rm(temp, { force: true });
    throw error;
  }

  void sweepScratch(tenant, dir);
  return target;
}

function attachmentFromImage(
  ref: ImageAttachmentRef,
  storage: "tmp" | "artifact",
  seq: number,
  requestedFilename?: string,
): Attachment {
  const filename =
    ref.name ||
    requestedFilename ||
    `${attachmentIdToHex(ref.attachmentId).slice(0, 12)}${MIME_TO_EXT[ref.mediaType] ?? ".img"}`;
  return {
    id: ref.attachmentId,
    filename,
    url: publicUrlFor(ref),
    bytes: ref.bytes,
    mimeType: ref.mediaType,
    storage,
    seq,
    ref,
    width: ref.width,
    height: ref.height,
  };
}

function attachmentFromFile(
  ref: FileAttachmentRef,
  mediaType: string,
  storage: "tmp" | "artifact",
  seq: number,
  requestedFilename?: string,
): Attachment {
  return {
    id: ref.attachmentId,
    filename: ref.name || requestedFilename || "attachment",
    url: publicUrlFor(ref),
    bytes: ref.bytes,
    mimeType: mediaType,
    storage,
    seq,
    ref,
  };
}

/**
 * Durably store one attachment through the tenant's R2-backed store.
 *
 * Images are normalized and admitted through `saveImage`; every other byte
 * sequence is stored verbatim through `saveFile`/`saveFileStream`.
 */
export async function saveAttachment(
  dataOrPayload: Buffer | string | SaveAttachmentPayload,
  options?: SaveAttachmentOptions,
  userId?: string,
): Promise<Attachment> {
  let data: Buffer | string | AsyncIterable<Uint8Array>;
  let effectiveOptions: SaveAttachmentOptions = options ?? {};
  let effectiveUserId = userId;

  if (
    dataOrPayload &&
    typeof dataOrPayload === "object" &&
    "buffer" in dataOrPayload &&
    !Buffer.isBuffer(dataOrPayload) &&
    !(dataOrPayload instanceof Uint8Array)
  ) {
    const payload = dataOrPayload;
    data = payload.buffer;
    effectiveOptions = {
      id: payload.id,
      filename: payload.filename,
      mimeType: payload.mediaType || payload.mimeType,
      storage: payload.storage,
      seq: payload.seq,
      ...options,
    };
    effectiveUserId = payload.userId ?? userId;
  } else {
    data = dataOrPayload as Buffer | string;
  }

  if (!effectiveUserId) {
    throw new Error(
      "saveAttachment requires an authenticated tenant id. Refusing to write an attachment without tenant isolation.",
    );
  }
  const tenant = assertTenantId(effectiveUserId);
  const store = attachmentStoreFor(tenant);

  const storage: "tmp" | "artifact" =
    effectiveOptions.storage === "artifact" ? "artifact" : "tmp";
  const seq = effectiveOptions.seq ?? 1;
  const requestedFilename = effectiveOptions.filename?.trim() || undefined;
  const declared = effectiveOptions.mimeType?.trim() || undefined;
  const metadata: Record<string, string> = { storage };

  if (isAsyncByteStream(data)) {
    const peeked = await peekStream(data);
    const sniffed = sniffMediaType(peeked.head, declared, requestedFilename);

    if (IMAGE_MEDIA_TYPES.has(sniffed)) {
      const buffer = await collectStream(peeked.stream);
      const ref = await store.saveImage({
        data: buffer,
        mediaType: sniffed as ImageMediaType,
        name: requestedFilename,
        metadata,
      });
      return attachmentFromImage(ref, storage, seq, requestedFilename);
    }

    const ref = await store.saveFileStream({
      data: peeked.stream,
      mediaType: sniffed,
      name: requestedFilename,
      metadata,
    });
    return attachmentFromFile(ref, sniffed, storage, seq, requestedFilename);
  }

  let buffer: Buffer;
  let dataUrlMediaType: string | undefined;
  if (typeof data === "string") {
    const matches = data.match(/^data:([a-zA-Z0-9/+.+-]+);base64,([\s\S]+)$/);
    if (matches) {
      dataUrlMediaType = matches[1];
      buffer = Buffer.from(matches[2], "base64");
    } else {
      buffer = Buffer.from(data, "base64");
    }
  } else {
    buffer = Buffer.from(data);
  }

  const sniffed = sniffMediaType(
    buffer,
    declared ?? dataUrlMediaType,
    requestedFilename,
  );

  if (IMAGE_MEDIA_TYPES.has(sniffed)) {
    const ref = await store.saveImage({
      data: buffer,
      mediaType: sniffed as ImageMediaType,
      name: requestedFilename,
      metadata,
    });
    return attachmentFromImage(ref, storage, seq, requestedFilename);
  }

  const ref = await store.saveFile({
    data: buffer,
    mediaType: sniffed,
    name: requestedFilename,
    metadata,
  });
  return attachmentFromFile(ref, sniffed, storage, seq, requestedFilename);
}
