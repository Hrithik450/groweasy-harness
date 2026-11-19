import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  fetchMetaCampaigns,
  createMetaCampaign,
  updateMetaCampaign,
  deleteMetaCampaign,
  MetaCampaignStatus,
} from "@/lib/connectors/meta.ads";

/**
 * GET /api/connectors/meta.ads/ad.accounts/campaigns?adAccountId=...&statusFilter=...&limit=...
 * Fetches campaigns for an ad account directly from Meta Graph API.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const adAccountId = searchParams.get("adAccountId");
    const statusFilter = searchParams.get("statusFilter") ?? undefined;
    const limit = searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined;

    if (!adAccountId) {
      return NextResponse.json(
        { error: "adAccountId query parameter is required" },
        { status: 400 },
      );
    }

    const res = await fetchMetaCampaigns({
      params: {
        adAccountId: adAccountId,
        statusFilter: statusFilter as MetaCampaignStatus | "ALL" | undefined,
        limit: limit,
      },
      context: {
        userId: user.id,
        providerSlug: "metaAds",
      },
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error?.message || "Failed to fetch campaigns" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      data: res.data || [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * POST /api/connectors/meta.ads/ad.accounts/campaigns
 * Creates a new campaign on Meta for the given ad account.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const name = body.name;
    const objective = body.objective;
    const adAccountId = body.adAccountId;

    if (!adAccountId || !name || !objective) {
      return NextResponse.json(
        { error: "adAccountId, name, and objective are required" },
        { status: 400 },
      );
    }

    const res = await createMetaCampaign({
      params: {
        adAccountId,
        name: name,
        objective: objective,
        status: body.status || "PAUSED",
        dailyBudget: body.dailyBudget ?? body.daily_budget,
        specialAdCategories:
          body.specialAdCategories ?? body.special_ad_categories,
      },
      context: {
        userId: user.id,
        providerSlug: "metaAds",
      },
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error?.message || "Failed to create campaign" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      data: res.data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/connectors/meta.ads/ad.accounts/campaigns
 * Updates campaign status, budget, or name on Meta.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const campaignId = body.campaignId;

    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId is required" },
        { status: 400 },
      );
    }

    const res = await updateMetaCampaign({
      params: {
        campaignId,
        name: body.name,
        status: body.status,
        dailyBudget: body.dailyBudget ?? body.daily_budget,
        lifetimeBudget: body.lifetimeBudget ?? body.lifetime_budget,
      },
      context: {
        userId: user.id,
        providerSlug: "metaAds",
      },
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error?.message || "Failed to update campaign" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      data: res.data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/connectors/meta.ads/ad.accounts/campaigns?campaignId=...
 * Deletes a campaign on Meta.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let campaignId = searchParams.get("campaignId");

    if (!campaignId) {
      const body = await req.json().catch(() => ({}));
      campaignId = body.campaignId;
    }

    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId is required" },
        { status: 400 },
      );
    }

    const res = await deleteMetaCampaign({
      params: { campaignId },
      context: {
        userId: user.id,
        providerSlug: "metaAds",
      },
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error?.message || "Failed to delete campaign" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      data: res.data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
