import { NextRequest, NextResponse } from "next/server";
import { getAuthSessionFromRequest } from "@/lib/auth";
import { disconnectConnectorBySlug } from "@/lib/services";

/**
 * POST /api/connectors/business.profile/disconnect
 * Disconnects the Business Profile connector and purges associated cron jobs.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthSessionFromRequest(req);
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = await disconnectConnectorBySlug(user.id, "businessProfile");
    if (!res.success) {
      return NextResponse.json(
        { error: res.error || "Failed to disconnect Brand Brain" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      status: "disconnected",
      message:
        "Brand Brain and associated automation jobs disconnected successfully",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to disconnect Brand Brain connector",
      },
      { status: 500 },
    );
  }
}
