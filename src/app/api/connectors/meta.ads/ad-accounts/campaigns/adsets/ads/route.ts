import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { fetchMetaAds } from "@/lib/connectors/meta.ads";

/**
 * GET /api/connectors/meta.ads/ad-accounts/campaigns/adsets/ads?adAccountId=...
 * Fetches live ads for one ad account directly from Meta.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const adAccountId = searchParams.get("adAccountId");
  const campaignId = searchParams.get("campaignId") ?? undefined;
  const adSetId = searchParams.get("adSetId") ?? undefined;

  if (!adAccountId) {
    return NextResponse.json(
      { error: "adAccountId query parameter is required" },
      { status: 400 },
    );
  }

  const res = await fetchMetaAds({
    params: { adAccountId, campaignId, adSetId },
    context: { userId: user.id, providerSlug: "meta" },
  });

  if (!res.success) {
    return NextResponse.json(
      { error: res.error?.message || "Failed to fetch ads" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    ads: res.data ?? [],
    data: res.data ?? [],
  });
}
