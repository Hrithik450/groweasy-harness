import { NextRequest, NextResponse } from "next/server";
import { getAuthSessionFromRequest } from "@/lib/auth/session";
import { disconnectConnectorBySlug } from "@/lib/services";

/**
 * POST /api/connectors/meta.ads/disconnect
 * Disconnects the Meta Ads connector and purges stored credentials and associated Meta cron jobs.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = await disconnectConnectorBySlug(user.id, "metaAds");
    if (!res.success) {
      return NextResponse.json(
        { error: res.error || "Failed to disconnect Meta Ads" },
        { status: 500 },
      );
    }

    // Gated jobs are parked by the connector service; they stay visible and
    // reconnect reactivates them.
    return NextResponse.json({
      success: true,
      status: "disconnected",
      message:
        "Meta Ads Manager and associated cron jobs disconnected successfully",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during disconnect",
      },
      { status: 500 },
    );
  }
}
