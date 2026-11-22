import { NextRequest, NextResponse } from "next/server";
import { getConnectorByUserIdAndSlug, upsertConnector } from "@/lib/services";
import { getSessionByUserIdAndSlug } from "@/lib/repositories";
import { getAuthSessionFromRequest } from "@/lib/auth";
import { reconcileStatus } from "@/lib/connectors/reconcile";
import { toBrowserConnector } from "@/lib/connectors/registry";
import {
  mergeBusinessProfilePatch,
  normalizeBusinessProfilePayload,
} from "@/lib/tools/business.profile/utils";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const instance = req.nextUrl.searchParams.get("instance") ?? undefined;
    const connectorRes = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
      instance,
    );

    return NextResponse.json({
      success: true,
      connector: connectorRes.data
        ? toBrowserConnector(
            reconcileStatus(connectorRes.data) as unknown as Record<
              string,
              unknown
            >,
          )
        : null,
      // Hidden analyzer session; the process feed streams its tool calls.
      sessionId: getSessionByUserIdAndSlug(user.id, "businessProfile")?.id ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const metadata = body?.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return NextResponse.json(
        { error: "Valid metadata object is required" },
        { status: 400 },
      );
    }

    const instance =
      typeof body?.instance === "string" && body.instance.trim()
        ? body.instance.trim()
        : undefined;

    const existing = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
      instance,
    );

    if (!existing.data) {
      return NextResponse.json(
        {
          error: instance
            ? `Business profile "${instance}" was not found.`
            : "Brand Brain is not connected",
        },
        { status: 404 },
      );
    }

    const existingProfile = normalizeBusinessProfilePayload(
      existing.data.metadata,
      (existing.data.metadata as { url?: string } | null)?.url,
    );

    const merged = mergeBusinessProfilePatch(existingProfile, metadata);

    const res = await upsertConnector({
      userId: user.id,
      slug: existing.data.slug,
      instance: existing.data.instance,
      providerSlug: existing.data.providerSlug,
      status: existing.data.status,
      metadata: merged as unknown as Record<string, unknown>,
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error || "Failed to save profile" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
