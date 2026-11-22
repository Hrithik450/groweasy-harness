import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getOnboardingStatus } from "@/lib/onboarding/status";

export async function GET(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  return NextResponse.json({
    success: true,
    data: getOnboardingStatus(user),
  });
}
