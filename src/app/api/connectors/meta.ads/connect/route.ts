import { NextRequest, NextResponse } from "next/server";
import { toBrowserConnector } from "@/lib/connectors/registry";
import { getSessionFromRequest } from "@/lib/auth/session";
import { syncMetaConnector } from "@/lib/connectors/meta.ads";
import { syncCampaignsBar } from "@/lib/bar/sync/campaigns";
import { activateCronJobsForConnector } from "@/lib/cron/activation";
import {
  ensureDefaultCronJobs,
  DEFAULT_META_CRON_JOBS,
  upsertConnector,
} from "@/lib/services";

/**
 * POST /api/connectors/meta.ads/connect
 * Connects and syncs the Meta Ads connector with an access token.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const token = (body.token || body.accessToken)?.trim();

    if (token) {
      const syncRes = await syncMetaConnector({
        context: {
          userId: user.id,
          providerSlug: "metaAds",
          accessToken: token,
        },
      });

      if (!syncRes.success) {
        return NextResponse.json(
          { error: syncRes.error?.message || "Failed to connect Meta account" },
          { status: 400 },
        );
      }

      await ensureDefaultCronJobs(user.id, DEFAULT_META_CRON_JOBS);
      activateCronJobsForConnector(user.id, "metaAds");

      // The Campaigns tab is Meta's: fill it as soon as the account connects.
      await syncCampaignsBar(user.id, { force: true }).catch((err) =>
        console.error("[Meta Connect] Campaign sync failed:", err),
      );

      return NextResponse.json({
        success: true,
        connector: toBrowserConnector(syncRes.data as unknown as Record<string, unknown>),
      });
    }

    const res = await upsertConnector({
      userId: user.id,
      slug: "metaAds",
      providerSlug: "metaAds",
      status: "connected",
      metadata: { connectedAt: new Date().toISOString() },
    });

    await ensureDefaultCronJobs(user.id, DEFAULT_META_CRON_JOBS);
    activateCronJobsForConnector(user.id, "metaAds");

    return NextResponse.json({
      success: true,
      connector: toBrowserConnector(
        res as unknown as Record<string, unknown>,
      ),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during connect",
      },
      { status: 500 },
    );
  }
}
