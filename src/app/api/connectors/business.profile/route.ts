import { NextRequest, NextResponse } from "next/server";
import { getConnectorByUserIdAndSlug, upsertConnector } from "@/lib/services";
import { getAuthSessionFromRequest } from "@/lib/auth/session";
import { reconcileSyncStatus } from "@/lib/connectors/sync.reconcile";
import { toBrowserConnector } from "@/lib/connectors/registry";
import { mergeKeywords } from "@/lib/tools/business.profile/utils";
import type { BusinessProfileKeywords } from "@/lib/connectors/business.profile";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connectorRes = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
    );

    return NextResponse.json({
      success: true,
      connector: connectorRes.data
        ? toBrowserConnector(
            reconcileSyncStatus(connectorRes.data) as unknown as Record<
              string,
              unknown
            >,
          )
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/connectors/business.profile
 * Stores edited profile metadata (branding, geography, competitors). The write
 * publishes to the session stream, so the client never echoes it back.
 */
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

    const existing = await getConnectorByUserIdAndSlug(
      user.id,
      "businessProfile",
    );
    if (!existing.data) {
      return NextResponse.json(
        { error: "Brand Brain is not connected" },
        { status: 404 },
      );
    }

    // Keywords are additive: a partial save must not drop stored phrases.
    const incoming = metadata as Record<string, unknown>;
    const incomingBrand = (incoming.brand ?? {}) as Record<string, unknown>;
    const existingBrand = ((existing.data.metadata ?? {}) as Record<
      string,
      unknown
    >).brand as Record<string, unknown> | undefined;
    const keywords = mergeKeywords(
      existingBrand?.keywords as BusinessProfileKeywords | undefined,
      incomingBrand.keywords as BusinessProfileKeywords | undefined,
    );

    const res = await upsertConnector({
      userId: user.id,
      slug: existing.data.slug,
      providerSlug: existing.data.providerSlug,
      status: existing.data.status,
      metadata: keywords
        ? { ...incoming, brand: { ...incomingBrand, keywords } }
        : metadata,
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
