import { NextRequest, NextResponse } from "next/server";
import { toBrowserConnector } from "@/lib/connectors/registry";
import { getSessionFromRequest } from "@/lib/auth/session";
import { syncMetaConnector } from "@/lib/connectors/meta.ads";
import { syncCampaignsDetailBar } from "@/lib/detail.bar/external/meta.campaigns";
import { activateCronJobsForConnector } from "@/lib/cron/activation";
import { getCronJobsByUserId } from "@/lib/repositories/cron.repo";
import {
  ensureDefaultCronJobs,
  getConnectorByUserIdAndProviderSlug,
  DEFAULT_META_CRON_JOBS,
} from "@/lib/services";

/** The Meta user behind a connection; that is all that decides rescheduling. */
function metaUserId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const userId = (metadata as { userId?: unknown }).userId;
  return typeof userId === "string" && userId ? userId : null;
}

/**
 * Schedule Meta's jobs only for a new Meta user or unscheduled jobs.
 * Re-activating resets `nextRunAt`, so a plain reconnect must not run it again.
 */
async function ensureMetaCronSchedule(
  userId: string,
  previousMetaUserId: string | null,
): Promise<void> {
  const latest = await getConnectorByUserIdAndProviderSlug(userId, "meta");
  const currentMetaUserId = metaUserId(latest.data?.metadata);
  const jobs = getCronJobsByUserId(userId).filter(
    (job) => job.requires === "metaAds",
  );
  const scheduled =
    jobs.length > 0 && jobs.every((job) => job.status === "active");

  if (
    previousMetaUserId !== null &&
    currentMetaUserId !== null &&
    previousMetaUserId === currentMetaUserId &&
    scheduled
  ) {
    return;
  }

  await ensureDefaultCronJobs(userId, DEFAULT_META_CRON_JOBS);
  activateCronJobsForConnector(userId, "metaAds");
}

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
    if (!token) {
      return NextResponse.json(
        { error: "A Meta access token is required" },
        { status: 400 },
      );
    }

    const previous = await getConnectorByUserIdAndProviderSlug(user.id, "meta");
    const previousMetaUserId = metaUserId(previous.data?.metadata);

    const syncRes = await syncMetaConnector({
      context: {
        userId: user.id,
        providerSlug: "meta",
        accessToken: token,
      },
    });

    if (!syncRes.success) {
      return NextResponse.json(
        { error: syncRes.error?.message || "Failed to connect Meta account" },
        { status: 400 },
      );
    }

    await ensureMetaCronSchedule(user.id, previousMetaUserId);

    await syncCampaignsDetailBar(user.id).catch((err) =>
      console.error("[Meta Connect] Campaign sync failed:", err),
    );

    return NextResponse.json({
      success: true,
      connector: toBrowserConnector(
        syncRes.data as unknown as Record<string, unknown>,
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
