import { NextRequest, NextResponse } from "next/server";
import {
  exchangeMetaCodeForToken,
  getPublicOrigin,
  getSessionFromRequest,
} from "@/lib/auth";
import { syncMetaConnector } from "@/lib/connectors/meta.ads";
import {
  activateCronJobsByRequires,
  ensureDefaultCronJobsByUserId,
} from "@/lib/repositories";
import { DEFAULT_META_CRON_JOBS } from "@/lib/repositories/defaults";
import { syncCampaignsDetailBar } from "@/lib/detail.bar/external/meta.campaigns";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const origin = getPublicOrigin(req);

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  const state = url.searchParams.get("state") ?? "/c";
  const safeReturnTo = state.startsWith("/") ? state : "/c";
  const separator = safeReturnTo.includes("?") ? "&" : "?";

  if (error || errorDesc) {
    const msg =
      error === "access_denied"
        ? "Meta Ads connection was cancelled."
        : "Meta Ads connection failed. Please try again.";
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent(msg)}`,
        origin,
      ),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent("Authorization code was not received from Meta. Please try again.")}`,
        origin,
      ),
    );
  }

  const user = await getSessionFromRequest(req);
  if (!user?.id) {
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent(
          "Your session expired while connecting Meta Ads. Please sign in and try again.",
        )}`,
        origin,
      ),
    );
  }

  try {
    const { accessToken } = await exchangeMetaCodeForToken(code, origin);
    await syncMetaConnector({
      context: { userId: user.id, providerSlug: "meta", accessToken },
    });

    ensureDefaultCronJobsByUserId(user.id, DEFAULT_META_CRON_JOBS);
    activateCronJobsByRequires(user.id, "metaAds");

    // The Campaigns tab is Meta's: fill it as soon as the account connects.
    await syncCampaignsDetailBar(user.id).catch((err) =>
      console.error("[Meta OAuth] Campaign sync failed:", err),
    );

    return NextResponse.redirect(new URL(safeReturnTo, origin));
  } catch (err: unknown) {
    console.error("[Meta OAuth Callback Error]", err);
    return NextResponse.redirect(
      new URL(
        `${safeReturnTo}${separator}error=${encodeURIComponent("Failed to complete Meta Ads connection. Please try again or contact support.")}`,
        origin,
      ),
    );
  }
}
