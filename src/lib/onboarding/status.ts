import type { CronJob, PublicUser } from "@/lib/db";
import { cronWorker } from "@/lib/cron/worker";
import {
  COMPETITOR_RESEARCH_JOB_NAME,
  getCronJobsByUserId,
  getConnectorByUserIdAndProviderSlug,
} from "@/lib/repositories";

export type OnboardingStep = "login" | "meta" | "business" | "sync";

export interface StatusState {
  status: string | null;
  error: string | null;
}

export interface OnboardingJobStatus extends StatusState {
  name: string;
}

export interface OnboardingStatus {
  authenticated: boolean;
  step: OnboardingStep;
  onboardedAt: string | null;
  meta: StatusState & { connected: boolean };
  business: StatusState & { connected: boolean; url: string | null };
  sync: StatusState & { ready: boolean; jobs: OnboardingJobStatus[] };
}

/** A "running" connector older than the scan cap is a crashed/interrupted run. */
function staleRunningThresholdMs(): number {
  const raw = Number(process.env.ONBOARDING_SCAN_TIMEOUT_MS);
  const scanMs = Number.isFinite(raw) && raw > 0 ? raw : 10 * 60 * 1000;
  return scanMs + 60_000;
}

function isStaleRunning(connector: {
  status?: string | null;
  updatedAt?: string | null;
} | null | undefined): boolean {
  if (connector?.status !== "running") return false;
  const updatedAt = connector.updatedAt ? Date.parse(connector.updatedAt) : NaN;
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt > staleRunningThresholdMs();
}

function connectorError(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const error = (metadata as { error?: unknown }).error;
  return typeof error === "string" && error ? error : null;
}

/** A job's live state: worker first, then its last durable outcome. */
function jobStatus(job: CronJob): string {
  if (cronWorker.isRunning(job.id)) return "running";
  if (job.lastRunAt) return "synced";
  if (job.lastError) return "failed";
  return "pending";
}

export function getOnboardingStatus(user: PublicUser | null): OnboardingStatus {
  const authenticated = Boolean(user?.googleId || user?.email);
  if (!user || !authenticated) {
    return {
      authenticated: false,
      step: "login",
      onboardedAt: null,
      meta: { connected: false, status: null, error: null },
      business: { connected: false, status: null, url: null, error: null },
      sync: { ready: false, status: null, error: null, jobs: [] },
    };
  }

  const meta = getConnectorByUserIdAndProviderSlug(user.id, "meta");
  const business = getConnectorByUserIdAndProviderSlug(user.id, "adsEasy");
  const metaConnected = meta?.status === "connected";
  const businessConnected = business?.status === "connected";
  const businessStale = isStaleRunning(business);

  // Business-profile refresh is covered by the scan itself, so it is not a
  // sync gate and does not appear in the sync list.
  // Competitor research is covered by the business-profile run; it is not an
  // onboarding gate. The remaining Meta jobs must each have one clean run.
  const jobs = getCronJobsByUserId(user.id).filter(
    (job) =>
      job.requires === "metaAds" &&
      job.name !== COMPETITOR_RESEARCH_JOB_NAME,
  );
  const onboardingMetaJobs = jobs;
  const metaRan =
    onboardingMetaJobs.length > 0 &&
    onboardingMetaJobs.every((job) => Boolean(job.lastRunAt) && !job.lastError);

  const lastError =
    jobs.find((job) => job.lastError && !job.lastRunAt)?.lastError ??
    jobs.find((job) => job.lastError)?.lastError ??
    null;
  const syncReady = metaConnected && metaRan;

  const step: OnboardingStep = !metaConnected
    ? "meta"
    : !businessConnected
      ? "business"
      : "sync";

  return {
    authenticated: true,
    step,
    onboardedAt: user.onboardedAt ?? null,
    meta: {
      connected: metaConnected,
      status: meta?.status ?? null,
      error: connectorError(meta?.metadata),
    },
    business: {
      connected: businessConnected,
      status: businessStale ? "error" : (business?.status ?? null),
      url:
        typeof (business?.metadata as { url?: unknown } | null)?.url ===
        "string"
          ? ((business?.metadata as { url: string }).url ?? null)
          : null,
      error: businessStale
        ? "The brand analysis was interrupted (the server restarted). Analyze the website again."
        : connectorError(business?.metadata),
    },
    sync: {
      ready: syncReady,
      status: syncReady ? "ready" : lastError ? "failed" : "running",
      error: lastError,
      jobs: jobs.map((job) => ({
        name: job.name,
        status: jobStatus(job),
        error: job.lastError ?? null,
      })),
    },
  };
}
