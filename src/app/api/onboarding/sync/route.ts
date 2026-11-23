import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { cronWorker } from "@/lib/cron/worker";
import {
  COMPETITOR_RESEARCH_JOB_NAME,
  DAILY_REPORT_JOB_NAME,
  IDEAS_JOB_NAME,
  getCronJobsByUserId,
} from "@/lib/repositories";
import { getConnectorByUserIdAndSlug } from "@/lib/services";

const REPORT_WAIT_MS = 20 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await getConnectorByUserIdAndSlug(
    user.id,
    "businessProfile",
  );
  const businessReady =
    business.success && business.data?.status === "connected";

  const jobs = getCronJobsByUserId(user.id).filter(
    (job) =>
      job.status === "active" &&
      job.requires === "metaAds" &&
      job.name !== COMPETITOR_RESEARCH_JOB_NAME &&
      (businessReady || job.name !== IDEAS_JOB_NAME),
  );

  const needingRun = jobs.filter(
    (job) => !job.lastRunAt || Boolean(job.lastError),
  );
  const lead = needingRun.filter((job) => job.name !== DAILY_REPORT_JOB_NAME);
  const report = needingRun.filter((job) => job.name === DAILY_REPORT_JOB_NAME);

  for (const job of lead) {
    void cronWorker.triggerNow(job.id).catch((error) => {
      console.error(`[Onboarding] Sync job ${job.name} failed:`, error);
    });
  }

  if (report.length > 0) {
    void runReportAfter(lead, report).catch((error) => {
      console.error("[Onboarding] Daily report failed:", error);
    });
  }

  return NextResponse.json({
    success: true,
    data: { started: needingRun.map((job) => job.name) },
  });
}

/** Wait for the lead jobs to finish, then queue the report. */
async function runReportAfter(
  lead: Array<{ id: string }>,
  report: Array<{ id: string }>,
): Promise<void> {
  const deadline = Date.now() + REPORT_WAIT_MS;
  while (
    Date.now() < deadline &&
    lead.some((job) => cronWorker.isRunning(job.id))
  ) {
    await sleep(2_000);
  }

  for (const job of report) {
    await cronWorker.triggerNow(job.id);
  }
}
