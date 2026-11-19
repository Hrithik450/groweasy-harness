import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getMimeTypeFromExt } from "@/lib/attachments/core";
import { readAttachmentBytes } from "@/lib/attachments/host";

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get("url");
  const requestedFilename =
    request.nextUrl.searchParams.get("filename") || "creative.png";

  if (!urlParam) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // Serve one R2 attachment with an attachment disposition.
  if (urlParam.startsWith("/api/attachments/")) {
    const resource = await readAttachmentBytes(urlParam);
    if (!resource) {
      return new NextResponse("Attachment not found", { status: 404 });
    }

    const filename = requestedFilename || resource.filename;
    const contentType =
      resource.contentType ||
      getMimeTypeFromExt(path.extname(resource.filename));

    return new NextResponse(Buffer.from(resource.data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  try {
    const targetUrl = urlParam.startsWith("/")
      ? new URL(urlParam, request.nextUrl.origin).toString()
      : urlParam;

    const parsed = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return new NextResponse("Invalid protocol", { status: 400 });
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.statusText}`, {
        status: response.status,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/png";

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${requestedFilename}"`,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Download proxy error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
