import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { fetchMetaAdSets } from "@/lib/connectors/meta.ads";

/**
 * GET /api/connectors/meta.ads/ad-accounts/campaigns/adsets?adAccountId=...
 * Fetches live ad sets for one ad account directly from Meta.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const adAccountId = searchParams.get("adAccountId");
  const campaignId = searchParams.get("campaignId") ?? undefined;

  if (!adAccountId) {
    return NextResponse.json(
      { error: "adAccountId query parameter is required" },
      { status: 400 },
    );
  }

  const res = await fetchMetaAdSets({
    params: { adAccountId, campaignId },
    context: { userId: user.id, providerSlug: "meta" },
  });

  if (!res.success) {
    return NextResponse.json(
      { error: res.error?.message || "Failed to fetch ad sets" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    adsets: res.data ?? [],
    data: res.data ?? [],
  });
}
