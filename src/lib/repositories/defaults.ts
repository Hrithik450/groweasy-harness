import { slugToTitle } from "@/lib/utils";
import { SESSION_SLUGS } from "@/lib/constants";
import type { Session } from "@/lib/db";
import type { ConnectorSlug, ScheduleTiming, SessionSlug } from "@/lib/db";

export type DefaultSessionConfig = Omit<
  Session,
  "id" | "userId" | "createdAt" | "updatedAt" | "slug"
> & {
  slug: SessionSlug;
};

/**
 * Scalable configuration options for individual default sessions.
 * Specify overrides for visibility (`hidden`), custom title, or extra parameters.
 */
export const SESSION_CONFIG_OVERRIDES: Partial<
  Record<SessionSlug, Partial<Omit<DefaultSessionConfig, "slug">>>
> = {};

/**
 * Default sessions derived automatically from canonical sidebar slugs.
 * Merges base slug attributes with scalable per-session configuration overrides.
 */
export const DEFAULT_SESSIONS: DefaultSessionConfig[] = SESSION_SLUGS.map(
  (slug) => {
    const override = SESSION_CONFIG_OVERRIDES[slug];
    return {
      slug,
      title: override?.title || slugToTitle(slug),
      hidden: override?.hidden ?? false,
      extra: override?.extra ?? null,
    };
  },
);

/** Config shape consumed by `ensureDefaultCronJobsByUserId`. */
export type DefaultCronJobConfig = {
  sessionSlug: SessionSlug;
  name: string;
  prompt: string;
  timing: ScheduleTiming;
  requires: ConnectorSlug | null;
};

/** Name shared with the cron service, so it can pre-sync the campaign tab. */
export const CAMPAIGN_HEALTH_JOB_NAME = "6-Hour Campaign Health";

/**
 * Default autonomous cron jobs: one per detail-bar tab. Seeding parks them
 * inactive; a connector activation is what admits them to the schedule.
 */
export const DEFAULT_CRON_JOBS: readonly DefaultCronJobConfig[] = [
  {
    sessionSlug: "businessProfile",
    name: "Daily Business Profile Update",
    prompt:
      "Refresh the Business Profile tab: load the `business-profile` skill, scan Meta Ad Library for winning ads and new competitors, and update the stored profile.",
    timing: { kind: "cron", expression: "0 8 * * *" },
    requires: "businessProfile",
  },
  {
    sessionSlug: "adManager",
    name: CAMPAIGN_HEALTH_JOB_NAME,
    prompt:
      "Classify every synced ad: load the `campaign-health` skill, read the current ads with `readCampaignAds`, and save one verdict per ad with `updateCampaignAds`.",
    timing: { kind: "cron", expression: "0 */6 * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adManager",
    name: "Hourly Alert Scan",
    prompt:
      "Run the hourly account health scan: load the `alerts` skill, diagnose active campaigns, and persist only new or changed alerts with `updateAlerts`.",
    timing: { kind: "cron", expression: "30 * * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adManager",
    name: "Daily Suggestions",
    prompt:
      "Run the daily optimisation review: load the `suggestions` skill, rank the highest-money moves, and persist the top 5 with `updateSuggestions`.",
    timing: { kind: "cron", expression: "0 7 * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adCreator",
    name: "Daily Creative Ideas",
    prompt:
      "Refresh the Ad Creator idea backlog: load the `ideas` skill, read competitor research, existing creatives, alerts and suggestions, and save 8–10 new ideas with `updateIdeas`.",
    timing: { kind: "cron", expression: "0 7 * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adStrategist",
    name: "Daily Competitor Research",
    prompt:
      "Run the daily competitor scan: load the `competitor-research` skill, research tracked rivals in Meta Ad Library, and save only new findings with `updateCompetitorResearch`.",
    timing: { kind: "cron", expression: "0 6 * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adStrategist",
    name: "Daily Report",
    prompt:
      "Write the daily report: load the `reports` skill, read the newest competitor research, campaigns, briefs, ideas, creatives, alerts and suggestions, and save one report with `updateReports`.",
    timing: { kind: "cron", expression: "0 9 * * *" },
    requires: "metaAds",
  },
];

/**
 * Default names retired from the seed registry. Reconciliation parks them so
 * re-seeding an existing user cannot leave them running.
 */
export const RETIRED_DEFAULT_CRON_JOB_NAMES: readonly string[] = [
  "Daily Diagnostic Audit",
  "Daily Market Winning Ads Scan",
  "Daily Account Winning Ads Scan",
] as const;

/** Meta-only subset of the default registry (used when Meta connects). */
export const DEFAULT_META_CRON_JOBS: readonly DefaultCronJobConfig[] =
  DEFAULT_CRON_JOBS.filter((job) => job.requires === "metaAds");

/** Business-profile subset of the default registry. */
export const DEFAULT_BUSINESS_PROFILE_CRON_JOBS: readonly DefaultCronJobConfig[] =
  DEFAULT_CRON_JOBS.filter((job) => job.requires === "businessProfile");
