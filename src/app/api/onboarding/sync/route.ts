import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { cronWorker } from "@/lib/cron/worker";
import { getCronJobsByUserId } from "@/lib/repositories";

export async function POST(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = getCronJobsByUserId(user.id).filter(
    (job) =>
      job.status === "active" &&
      job.requires === "metaAds" &&
      job.name !== "Daily Competitor Research",
  );

  const needingRun = jobs.filter(
    (job) => !job.lastRunAt || Boolean(job.lastError),
  );

  for (const job of needingRun) {
    void cronWorker.triggerNow(job.id).catch((error) => {
      console.error(`[Onboarding] Sync job ${job.name} failed:`, error);
    });
  }

  return NextResponse.json({
    success: true,
    data: { started: needingRun.map((job) => job.name) },
  });
}
