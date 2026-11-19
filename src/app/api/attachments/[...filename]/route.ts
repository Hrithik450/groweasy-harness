import path from "node:path";
import { NextResponse } from "next/server";
import { loadAudioPreview } from "@/lib/attachments/audio-catalog";
import { tryParseAttachmentId, getMimeTypeFromExt } from "@/lib/attachments/core";
import type { R2StreamedObject } from "@/lib/attachments/drivers/r2";
import { getAttachmentStore } from "@/lib/attachments/host";

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".ogg"];
const IMMUTABLE = "public, max-age=31536000, immutable";

interface RouteProps {
  params: Promise<{ filename: string | string[] }>;
}

/**
 * GET/HEAD /api/attachments/[...filename]
 *
 * `<attachmentId>` (bare digest or `sha256:<hex>`) streams the content-
 * addressed R2 object. `audios/<name>` serves the shared voice catalog from
 * R2. Byte ranges are forwarded so video and audio can be sought in-chat.
 */
export async function GET(
  req: Request,
  props: RouteProps,
): Promise<Response> {
  return serve(req, props);
}

export async function HEAD(
  req: Request,
  props: RouteProps,
): Promise<Response> {
  return serve(req, props);
}

async function serve(req: Request, props: RouteProps): Promise<Response> {
  try {
    const { filename } = await props.params;
    const segments = (
      Array.isArray(filename) ? filename : filename ? [filename] : []
    ).filter(Boolean);

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "Filename is required" },
        { status: 400 },
      );
    }

    if (segments[0] === "audios") {
      return serveAudio(req, segments.slice(1).join("/"));
    }

    const attachmentId = tryParseAttachmentId(segments.join("/"));
    if (!attachmentId) {
      return NextResponse.json(
        { error: "Invalid attachment id" },
        { status: 400 },
      );
    }

    const range = req.headers.get("range") ?? undefined;
    const object = await getAttachmentStore().openAttachmentObject(
      attachmentId,
      range === undefined ? {} : { range },
    );

    if (!object) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }

    return streamedObjectResponse(req, object);
  } catch (error) {
    console.error("[Attachments API] Error serving attachment:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

async function serveAudio(req: Request, rest: string): Promise<Response> {
  const file = await resolveAudioFile(rest);

  if (!file) {
    // Never let a miss be cached for a year: a preview published later must be
    // able to appear without a cache purge.
    return NextResponse.json(
      { error: "Attachment not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const size = file.buffer.byteLength;
  const contentType = getMimeTypeFromExt(path.extname(file.name));

  const range = req.headers.get("range");
  const match = range?.match(/bytes=(\d+)-(\d*)/);
  if (match) {
    const start = Number.parseInt(match[1] ?? "", 10);
    const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (start < size && end < size && start <= end) {
      const chunk = file.buffer.subarray(start, end + 1);
      const body =
        req.method === "HEAD" ? null : new Uint8Array(chunk);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunk.byteLength.toString(),
          "Content-Type": contentType,
          "Cache-Control": IMMUTABLE,
        },
      });
    }
  }

  const body =
    req.method === "HEAD" ? null : new Uint8Array(file.buffer);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": size.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": IMMUTABLE,
    },
  });
}

async function resolveAudioFile(
  rest: string,
): Promise<{ buffer: Buffer; name: string } | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }

  const safeName = path.basename(decoded);
  if (!safeName) return null;

  const candidates = [safeName];
  if (!path.extname(safeName)) {
    candidates.push(...AUDIO_EXTENSIONS.map((ext) => `${safeName}${ext}`));
  }

  for (const candidate of candidates) {
    const buffer = await loadAudioPreview(candidate);
    if (buffer !== null) return { buffer, name: candidate };
  }
  return null;
}

function streamedObjectResponse(
  req: Request,
  object: R2StreamedObject,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": object.contentType || "application/octet-stream",
    "Accept-Ranges": object.acceptRanges || "bytes",
    "Cache-Control": IMMUTABLE,
  };

  if (object.contentLength !== undefined) {
    headers["Content-Length"] = object.contentLength.toString();
  }
  if (object.contentRange) {
    headers["Content-Range"] = object.contentRange;
  }

  const status = object.contentRange ? 206 : 200;

  if (req.method === "HEAD") {
    void disposeBody(object.body);
    return new Response(null, { status, headers });
  }

  return new Response(toWebStream(object.body), { status, headers });
}

function toWebStream(
  body: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

async function disposeBody(body: AsyncIterable<Uint8Array>): Promise<void> {
  await body[Symbol.asyncIterator]().return?.();
}
