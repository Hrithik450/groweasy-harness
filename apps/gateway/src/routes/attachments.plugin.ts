/**
 * Attachment and download HTTP routes, served by the gateway's host web server.
 *
 * Ported from the Next.js route handlers that previously lived under
 * `src/app/api/attachments/**` and `src/app/api/download/route.ts`. The request
 * and response contracts are kept: authentication before parsing, multipart
 * upload admission, tenant-scoped R2 delivery, the shared voice catalog, and
 * the download proxy all answer with the same status codes and payloads.
 *
 * The routes are registered directly on `ctx.webServer` rather than through
 * the Connection carrier because they are not RPC methods. Authentication and
 * the origin allowlist are resolved here through the gateway's shared
 * request-identity resolver (session cookie, `oh-user-id` identity cookie,
 * anonymous headers/query).
 *
 * @module @openai-harness/gateway/routes/attachments
 */

import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Context } from "@deepseek-ai/cordis";
import { DEFAULT_MAX_REQUEST_BODY_BYTES } from "@openai-harness/client-connection";
import type {} from "@openai-harness/host-webserver";
import {
  attachmentStoreFor,
  getMimeTypeFromExt,
  materializeAttachment,
  parseAttachmentId,
  saveAttachment,
  type Attachment,
  type R2StreamedObject,
} from "@openai-harness/attachment-r2";
import { getRequestUser } from "../request-user";
import { probeMedia } from "@openai-harness/tool-composition";
import { loadAudioPreview } from "./audio-catalog";

/** Exact path served by the multipart upload handler. */
export const ATTACHMENT_UPLOAD_PATH = "/api/attachments/upload";
/** Prefix owned by the attachment file delivery handler. */
export const ATTACHMENT_FILES_PATH = "/api/attachments";
/** Exact path served by the download proxy. */
export const DOWNLOAD_PATH = "/api/download";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_DURATION_SECONDS = 60;

/** Upload ceiling; matches the `/api` carrier's buffered body limit. */
const MAX_UPLOAD_BYTES = DEFAULT_MAX_REQUEST_BODY_BYTES;

const DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173";

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];

/** A request body that crossed the upload ceiling while streaming. */
class UploadTooLargeError extends Error {
  constructor() {
    super("request body is too large");
    this.name = "UploadTooLargeError";
  }
}

/** Send one JSON response using the NextResponse.json contract. */
function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text).toString(),
  });
  res.end(text);
}

/** Send one plain-text response. */
function sendText(
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {},
): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body).toString(),
    ...headers,
  });
  res.end(body);
}

/** Resolve the configured browser origins allowed to call gateway routes. */
function allowedOrigins(): readonly string[] {
  return (process.env.GATEWAY_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Reject a foreign browser Origin before authentication, matching the
 * Connection carrier's admission rule. Requests without an Origin (native
 * clients, media elements, server-to-server calls) are allowed.
 */
function rejectForeignOrigin(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin === "") return false;
  if (allowedOrigins().includes(origin)) return false;
  sendText(res, 403, "forbidden");
  return true;
}

/**
 * Resolve the authenticated user id from the request through the gateway's
 * shared identity resolver (verified session cookie, browser identity cookie,
 * then the anonymous header/query fallbacks).
 */
export async function authenticateRequest(
  req: IncomingMessage,
): Promise<string | null> {
  try {
    return (await getRequestUser(req))?.id ?? null;
  } catch {
    // An invalid session (or missing AUTH_SECRET) is simply unauthenticated.
    return null;
  }
}

/** Build the absolute request URL from the listener's `Host` header. */
function requestUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? "localhost";
  return new URL(req.url ?? "/", `http://${host}`);
}

/** Parse a decimal Content-Length, or undefined when absent/malformed. */
function declaredContentLength(req: IncomingMessage): number | undefined {
  const raw = req.headers["content-length"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) return undefined;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : undefined;
}

/**
 * Stream the request body while enforcing the upload ceiling, failing inside
 * the stream so a chunked body is stopped as early as the declared one.
 */
async function* boundedBody(
  req: IncomingMessage,
  maxBytes: number,
  state: { exceeded: boolean },
): AsyncIterable<Uint8Array> {
  let size = 0;
  for await (const chunk of req) {
    const data = chunk as Buffer;
    size += data.byteLength;
    if (size > maxBytes) {
      state.exceeded = true;
      throw new UploadTooLargeError();
    }
    yield data;
  }
}

/** Convert the node request into a fetch Request for multipart parsing. */
function toUploadRequest(
  req: IncomingMessage,
  state: { exceeded: boolean },
): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }
  const stream = Readable.toWeb(
    Readable.from(boundedBody(req, MAX_UPLOAD_BYTES, state), {
      objectMode: false,
    }),
  ) as ReadableStream<Uint8Array>;
  return new Request(requestUrl(req), {
    method: req.method ?? "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

/** Delete every attachment committed earlier in one upload request. */
async function deleteCommitted(
  attachments: readonly Attachment[],
  tenantId: string,
): Promise<void> {
  const store = attachmentStoreFor(tenantId);
  for (const attachment of attachments) {
    try {
      await store.deleteAttachment(attachment.ref.attachmentId);
    } catch (error) {
      console.error(
        "[Attachments Upload API] Failed to delete committed object:",
        error,
      );
    }
  }
}

/**
 * POST upload handler. Keeps the moved Next handler's order and answers:
 * 401 unauthenticated, 415 non-multipart, 400 unparseable/empty/oversized
 * image or over-long video, 413 over the transport body cap, and 500 on any
 * unexpected failure.
 */
export async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("allow", "POST");
    sendText(res, 405, "Method Not Allowed");
    return;
  }
  if (rejectForeignOrigin(req, res)) return;

  try {
    const userId = await authenticateRequest(req);
    if (!userId) {
      sendJson(res, 401, { error: "Authentication required" });
      return;
    }

    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) {
      sendJson(res, 415, {
        error: "Unsupported content type. Expected multipart/form-data",
      });
      return;
    }

    const declared = declaredContentLength(req);
    if (declared !== undefined && declared > MAX_UPLOAD_BYTES) {
      req.resume();
      sendJson(res, 413, { error: "Request body too large" });
      return;
    }

    const uploadState = { exceeded: false };
    let formData: FormData;
    try {
      formData = await toUploadRequest(req, uploadState).formData();
    } catch (error) {
      if (uploadState.exceeded || error instanceof UploadTooLargeError) {
        req.resume();
        sendJson(res, 413, { error: "Request body too large" });
        return;
      }
      console.error("[Attachments Upload API] req.formData() failed:", error);
      sendJson(res, 400, {
        error:
          "Failed to parse uploaded file. The file may exceed size limits or the upload was interrupted.",
      });
      return;
    }

    const storage = formData.get("storage") as "tmp" | "artifact" | null;
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      sendJson(res, 400, { error: "No files provided in form data" });
      return;
    }

    const attachments: Attachment[] = [];

    for (const file of files) {
      if (!file || typeof file.arrayBuffer !== "function") continue;

      const isVideo =
        file.type?.startsWith("video/") ||
        /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name);

      if (!isVideo && file.size > MAX_IMAGE_BYTES) {
        await deleteCommitted(attachments, userId);
        const limitMb = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
        sendJson(res, 400, {
          error: `Image "${file.name}" exceeds maximum ${limitMb}MB limit`,
        });
        return;
      }

      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      const saved = await saveAttachment(
        buffer,
        {
          mimeType: file.type || (isVideo ? "video/mp4" : "image/png"),
          storage: storage ?? "tmp",
          filename: file.name,
        },
        userId,
      );

      if (isVideo) {
        const probePath = await materializeAttachment(saved.url, userId);
        try {
          const probeResult = probeMedia(probePath);
          if (probeResult.duration > MAX_VIDEO_DURATION_SECONDS + 0.5) {
            await attachmentStoreFor(userId).deleteAttachment(
              saved.ref.attachmentId,
            );
            await deleteCommitted(attachments, userId);
            sendJson(res, 400, {
              error: `Video "${file.name}" exceeds maximum duration of 60 seconds (detected: ${String(Math.round(probeResult.duration))}s).`,
            });
            return;
          }
        } finally {
          await fs.promises.rm(probePath, { force: true });
        }
      }

      attachments.push(saved);
    }

    sendJson(res, 200, { success: true, data: attachments });
  } catch (error) {
    console.error("[Attachments Upload API] Error saving attachment:", error);
    sendJson(res, 500, {
      error:
        error instanceof Error ? error.message : "Failed to upload attachments",
    });
  }
}

/** Resolve the shared voice catalog name requested by the URL. */
function resolveAudioCatalogName(rest: string): string[] {
  const safeName = path.basename(decodeURIComponent(rest));
  if (!safeName) return [];

  const candidates = [safeName];
  if (!path.extname(safeName)) {
    candidates.push(...AUDIO_EXTENSIONS.map((ext) => `${safeName}${ext}`));
  }
  return candidates;
}

/**
 * Serve one file from the shared voice catalog.
 *
 * The catalog lives in R2 under the deployment prefix and is cached in
 * process memory; nothing is read from or written to the host filesystem.
 */
async function serveAudioFile(
  req: IncomingMessage,
  res: ServerResponse,
  rest: string,
): Promise<void> {
  let fileBuffer: Buffer | null = null;
  let fileName: string | null = null;
  for (const candidate of resolveAudioCatalogName(rest)) {
    fileBuffer = await loadAudioPreview(candidate);
    if (fileBuffer !== null) {
      fileName = candidate;
      break;
    }
  }
  if (fileBuffer === null || fileName === null) {
    sendJson(res, 404, { error: "Attachment not found" });
    return;
  }

  const fileSize = fileBuffer.byteLength;
  const contentType = getMimeTypeFromExt(path.extname(fileName).toLowerCase());
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1] ?? "", 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
      if (start < fileSize && end < fileSize && start <= end) {
        const chunkSize = end - start + 1;
        const chunkBuffer = fileBuffer.subarray(start, end + 1);
        res.writeHead(206, {
          "content-range": `bytes ${String(start)}-${String(end)}/${String(fileSize)}`,
          "accept-ranges": "bytes",
          "content-length": chunkSize.toString(),
          "content-type": contentType,
          "cache-control": "public, max-age=31536000, immutable",
        });
        if (req.method === "HEAD") res.end();
        else res.end(chunkBuffer);
        return;
      }
    }
  }

  res.writeHead(200, {
    "content-type": contentType,
    "content-length": fileBuffer.byteLength.toString(),
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=31536000, immutable",
  });
  if (req.method === "HEAD") res.end();
  else res.end(fileBuffer);
}

/** Release an unused response body (HEAD requests). */
function disposeBody(body: AsyncIterable<Uint8Array>): void {
  const destroy = (body as { destroy?: () => void }).destroy;
  if (typeof destroy === "function") {
    destroy.call(body);
    return;
  }
  const iterator = body[Symbol.asyncIterator]();
  void iterator.return?.();
}

/** Write an async byte body with backpressure and disconnect handling. */
async function pipeBody(
  res: ServerResponse,
  body: AsyncIterable<Uint8Array>,
): Promise<void> {
  try {
    for await (const chunk of body) {
      if (res.destroyed) break;
      if (!res.write(chunk)) {
        await new Promise<void>((resolve) => {
          const done = (): void => {
            res.off("drain", done);
            res.off("close", done);
            resolve();
          };
          res.once("drain", done);
          res.once("close", done);
        });
      }
    }
    res.end();
  } catch (error) {
    res.destroy();
    throw error;
  }
}

/** Stream one tenant object, optionally as a 206 byte-range response. */
async function streamedObjectResponse(
  req: IncomingMessage,
  res: ServerResponse,
  object: R2StreamedObject,
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": object.contentType || "application/octet-stream",
    "accept-ranges": object.acceptRanges || "bytes",
    // Tenant objects are immutable (content-addressed) but must never be stored
    // by a shared cache: the URL is the only authorization, so keep it private.
    "cache-control": "private, max-age=31536000, immutable",
  };
  if (object.contentLength !== undefined) {
    headers["content-length"] = object.contentLength.toString();
  }
  if (object.contentRange) {
    headers["content-range"] = object.contentRange;
  }

  const status = object.contentRange ? 206 : 200;
  if (req.method === "HEAD") {
    res.writeHead(status, headers);
    res.end();
    disposeBody(object.body);
    return;
  }
  res.writeHead(status, headers);
  await pipeBody(res, object.body);
}

/**
 * GET attachment handler.
 *
 * - `audios/<file>` serves the shared static voice catalog from R2, cached in
 *   process memory.
 * - `<attachmentId>` (bare digest, `sha256:<hex>`, or an app URL segment)
 *   requires an auth session and streams the caller tenant's object.
 */
export async function handleAttachmentFile(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    sendText(res, 405, "Method Not Allowed");
    return;
  }
  if (rejectForeignOrigin(req, res)) return;

  try {
    const pathname = requestUrl(req).pathname;
    const rest = pathname
      .slice(ATTACHMENT_FILES_PATH.length)
      .replace(/^\/+/, "");
    const segments = rest === "" ? [] : rest.split("/");

    if (segments.length === 0 || !segments[0]) {
      sendJson(res, 400, { error: "Filename is required" });
      return;
    }

    if (segments[0] === "audios") {
      await serveAudioFile(req, res, segments.slice(1).join("/"));
      return;
    }

    const userId = await authenticateRequest(req);
    if (!userId) {
      sendJson(res, 401, { error: "Authentication required" });
      return;
    }

    let attachmentId: ReturnType<typeof parseAttachmentId>;
    try {
      attachmentId = parseAttachmentId(segments.join("/"));
    } catch {
      sendJson(res, 400, { error: "Invalid attachment id" });
      return;
    }

    const store = attachmentStoreFor(userId);
    const range = req.headers.range;
    const object = await store.openAttachmentObject(
      attachmentId,
      range === undefined ? {} : { range },
    );
    if (!object) {
      // Missing objects and other tenants' ids are indistinguishable.
      sendJson(res, 404, { error: "Attachment not found" });
      return;
    }

    await streamedObjectResponse(req, res, object);
  } catch (error) {
    console.error("[Attachments API] Error serving attachment:", error);
    sendJson(res, 500, { error: "Internal Server Error" });
  }
}

/** Build the attachment-download response headers. */
function attachmentDownloadHeaders(
  object: R2StreamedObject,
  filename: string,
): Record<string, string> {
  const safeFilename = filename.replace(/["\r\n\\]/g, "") || "attachment";
  const headers: Record<string, string> = {
    "content-type": object.contentType || "application/octet-stream",
    "content-disposition": `attachment; filename="${safeFilename}"`,
    "cache-control": "public, max-age=31536000, immutable",
  };
  if (object.contentLength !== undefined) {
    headers["content-length"] = object.contentLength.toString();
  }
  return headers;
}

/** Serve one tenant object as a forced download. */
async function attachmentDownloadResponse(
  req: IncomingMessage,
  res: ServerResponse,
  object: R2StreamedObject,
  filename: string,
): Promise<void> {
  const headers = attachmentDownloadHeaders(object, filename);
  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    disposeBody(object.body);
    return;
  }
  res.writeHead(200, headers);
  await pipeBody(res, object.body);
}

/**
 * GET download proxy handler.
 *
 * An `/api/attachments/` URL is served from the caller tenant's store with an
 * attachment disposition; any other URL is fetched and relayed as a download.
 */
export async function handleDownload(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    sendText(res, 405, "Method Not Allowed");
    return;
  }
  if (rejectForeignOrigin(req, res)) return;

  const url = requestUrl(req);
  const urlParam = url.searchParams.get("url");
  const filename = url.searchParams.get("filename") || "creative.png";

  if (!urlParam) {
    sendText(res, 400, "Missing url parameter");
    return;
  }

  if (urlParam.startsWith("/api/attachments/")) {
    const userId = await authenticateRequest(req);
    if (!userId) {
      sendText(res, 401, "Authentication required");
      return;
    }

    let attachmentId: ReturnType<typeof parseAttachmentId>;
    try {
      attachmentId = parseAttachmentId(urlParam);
    } catch {
      sendText(res, 400, "Invalid attachment id");
      return;
    }

    const object = await attachmentStoreFor(userId).openAttachmentObject(
      attachmentId,
    );
    if (!object) {
      sendText(res, 404, "Attachment not found");
      return;
    }

    await attachmentDownloadResponse(req, res, object, filename);
    return;
  }

  try {
    const targetUrl = urlParam.startsWith("/")
      ? new URL(urlParam, url.origin).toString()
      : urlParam;

    const parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      sendText(res, 400, "Invalid protocol");
      return;
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      sendText(
        res,
        response.status,
        `Failed to fetch image: ${response.statusText}`,
      );
      return;
    }

    const contentType = response.headers.get("content-type") || "image/png";
    if (req.method === "HEAD") {
      const length = response.headers.get("content-length");
      res.writeHead(200, {
        "content-type": contentType,
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "public, max-age=31536000, immutable",
        ...(length === null ? {} : { "content-length": length }),
      });
      res.end();
      await response.body?.cancel();
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    res.writeHead(200, {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": arrayBuffer.byteLength.toString(),
    });
    res.end(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Download proxy error:", error);
    sendText(res, 500, "Internal server error");
  }
}

/**
 * Attachment and download routes for the browser host.
 *
 * Registered on `ctx.webServer` so they keep their public HTTP contracts while
 * the Next application no longer owns the handlers.
 */
export class AttachmentsRoutes {
  static inject = ["webServer"];

  constructor(private readonly ctx: Context) {
    this.ctx.effect(
      () =>
        this.ctx.webServer.register({
          kind: "exact",
          path: ATTACHMENT_UPLOAD_PATH,
          handler: (req, res) => handleUpload(req, res),
        }),
      "gateway: attachment upload route",
    );
    this.ctx.effect(
      () =>
        this.ctx.webServer.register({
          kind: "prefix",
          path: ATTACHMENT_FILES_PATH,
          handler: (req, res) => handleAttachmentFile(req, res),
        }),
      "gateway: attachment file route",
    );
    this.ctx.effect(
      () =>
        this.ctx.webServer.register({
          kind: "exact",
          path: DOWNLOAD_PATH,
          handler: (req, res) => handleDownload(req, res),
        }),
      "gateway: download proxy route",
    );
  }
}

export default AttachmentsRoutes;
