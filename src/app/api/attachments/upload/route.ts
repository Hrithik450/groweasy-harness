import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import {
  getMimeTypeFromExt,
  type ImageMediaType,
  type VideoMediaType,
} from "@/lib/attachments/core";
import {
  getAttachmentStore,
  toAttachmentReceipt,
  type AttachmentReceipt,
} from "@/lib/attachments/host";
import { recordReceipt } from "@/lib/attachments/receipts.repo";
import { sweepOrphanedReceipts } from "@/lib/attachments/sweep";

const IMAGE_MEDIA_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const VIDEO_MEDIA_TYPES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const attachments: AttachmentReceipt[] = [];
    const contentType = req.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error: "Unsupported content type. Expected multipart/form-data",
        },
        { status: 415 },
      );
    }

    const formData = await req.formData();
    const storage = formData.get("storage") as "tmp" | "artifact" | null;
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided in form data" },
        { status: 400 },
      );
    }

    const store = getAttachmentStore();

    for (const [index, file] of files.entries()) {
      if (!file || typeof file.arrayBuffer !== "function") continue;

      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds maximum 20MB limit` },
          { status: 400 },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const mediaType =
        file.type ||
        getMimeTypeFromExt(path.extname(file.name)) ||
        "application/octet-stream";

      const ref = IMAGE_MEDIA_TYPES.has(mediaType)
        ? await store.saveImage({
            data: buffer,
            mediaType: mediaType as ImageMediaType,
            name: file.name,
          })
        : VIDEO_MEDIA_TYPES.has(mediaType)
          ? await store.saveVideo({
              data: buffer,
              mediaType: mediaType as VideoMediaType,
              name: file.name,
            })
          : await store.saveFile({
              data: buffer,
              mediaType,
              name: file.name,
            });

      attachments.push(
        toAttachmentReceipt(ref, mediaType, {
          storage: storage ?? "tmp",
          seq: index + 1,
          filename: file.name,
        }),
      );

      recordReceipt(ref.attachmentId);
    }

    void sweepOrphanedReceipts().catch((error) => {
      console.error("[Attachments Upload API] Sweep failed:", error);
    });

    return NextResponse.json({
      success: true,
      data: attachments,
    });
  } catch (error) {
    console.error("[Attachments Upload API] Error saving attachment:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload attachments",
      },
      { status: 500 },
    );
  }
}
