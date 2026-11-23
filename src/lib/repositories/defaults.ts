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
> = {
  // The profile analyzer is background machinery, not a chat the user owns.
  businessProfile: { hidden: true },
};

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
export const IDEAS_JOB_NAME = "Daily Creative Ideas";
export const COMPETITOR_RESEARCH_JOB_NAME = "Daily Competitor Research";
export const DAILY_REPORT_JOB_NAME = "Daily Report";

/**
 * Default autonomous cron jobs: one per detail-bar tab. Seeding parks them
 * inactive; a connector activation is what admits them to the schedule.
 */
export const DEFAULT_CRON_JOBS: readonly DefaultCronJobConfig[] = [
  {
    sessionSlug: "businessProfile",
    name: "Daily Business Profile Update",
    prompt:
      "Refresh our Business Profile using the `business-profile` skill. Check Meta Ad Library for new winning ads and new competitors, and for any new keywords (up to 5 broad and 5 product/service). Keep everything already in the profile and add only what is new. Save the updated profile.",
    timing: { kind: "cron", expression: "0 8 * * *" },
    requires: "businessProfile",
  },
  {
    sessionSlug: "adManager",
    name: CAMPAIGN_HEALTH_JOB_NAME,
    prompt:
      "Classify all our live ads using the `ads-classifier` skill. Read them with `fetchMetaAds`, give each ad one label with its computed metrics, and save the results with `upsertAdsClassified`. If the account is new or thin, judge ads relative to each other and mark those labels as relative.",
    timing: { kind: "cron", expression: "0 */6 * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adManager",
    name: "Hourly Alert Scan",
    prompt:
      "Check the health of our active campaigns using the `alerts` skill. Look for problems that need attention (fatigue, overspend, tracking or delivery issues). Compare with the alerts we already have and save only the new or changed ones with `updateAlerts`. If nothing has changed, save nothing.",
    timing: { kind: "cron", expression: "30 * * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adManager",
    name: "Daily Suggestions",
    prompt:
      "Review our ad account using the `suggestions` skill and find the moves that would save or make the most money. Rank them by impact and save the top 5 with `updateSuggestions`. Skip any suggestion we already have open.",
    timing: { kind: "cron", expression: "0 7 * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adCreator",
    name: IDEAS_JOB_NAME,
    prompt:
      "Refresh our idea backlog using the `ideas` skill. Read the saved ideas first so you don't repeat any. Pull the full context: the Business Profile, competitor research with every saved ad, our classified campaign ads (winners first), creatives, alerts, suggestions and briefs. If the research has no usable ads, search Meta Ad Library yourself with `searchAdLibrary` (objective 3 of the `competitor-research` skill). Always save at least 3 new, ranked ideas with `updateIdeas` (up to 10), topping up with starting ideas from the Business Profile when the evidence is thin.",
    timing: { kind: "cron", expression: "0 7 * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adStrategist",
    name: COMPETITOR_RESEARCH_JOB_NAME,
    prompt:
      "Scan our competitors in Meta Ad Library using the `competitor-research` skill. Cover the rivals we track and any newly found ones. Read what we have already saved and save only new findings with `saveCompetitorResearch`. If nothing new turned up, save nothing.",
    timing: { kind: "cron", expression: "0 6 * * *" },
    requires: "metaAds",
  },
  {
    sessionSlug: "adStrategist",
    name: DAILY_REPORT_JOB_NAME,
    prompt:
      "Write the report for the last 24 hours using the `daily-report` skill. Read the latest campaigns, competitor research, alerts and suggestions, plus any briefs, ideas and creatives created in that window. Lead with the biggest change, end with one action for today, and save it with `updateDailyReport`. If campaigns have no data, still report the detail-bar progress and today's moves.",
    timing: { kind: "cron", expression: "0 9 * * *" },
    requires: "metaAds",
  },
];

/** Meta-only subset of the default registry (used when Meta connects). */
export const DEFAULT_META_CRON_JOBS: readonly DefaultCronJobConfig[] =
  DEFAULT_CRON_JOBS.filter((job) => job.requires === "metaAds");

/** Business-profile subset of the default registry. */
export const DEFAULT_BUSINESS_PROFILE_CRON_JOBS: readonly DefaultCronJobConfig[] =
  DEFAULT_CRON_JOBS.filter((job) => job.requires === "businessProfile");
