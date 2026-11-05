/**
 * Product default job seeds.
 *
 * The reference repository has no `schedule-defaults` package (its Schedule
 * package models reminders only), so these seeds stay in the Schedule package
 * rather than creating a package the reference cannot mirror. They are plain
 * data: a workflow `type`, a default session slug, a name, a prompt, and a
 * five-field cron expression. A host passes them to
 * {@link ScheduleManager.ensureDefaultCronJobs} after resolving session slugs
 * to ids through its own session records.
 *
 * The prompts are product configuration for this deployment, not schedule
 * rules; keeping them here means the application no longer owns a second cron
 * service just to hold them.
 *
 * @module @openai-harness/schedule
 */

import {
  compileAlertsSystemPrompt,
  compileCampaignsSystemPrompt,
  compileReportsSystemPrompt,
  compileSuggestionsSystemPrompt,
} from "@openai-harness/system-prompt";

import type { DefaultCronJob } from "./types";

/** Default Business Profile cron jobs. */
export const DEFAULT_BUSINESS_PROFILE_CRON_JOBS: readonly DefaultCronJob[] = [
  {
    type: "businessProfile/update",
    sessionSlug: "businessProfile",
    name: "Daily Business Profile Update",
    prompt:
      "Perform the daily market watch and business profile intelligence scan. Fetch existing business profile, inspect Meta Ad Library for winning ad campaigns and new competitors, and update the profile.",
    schedule: "0 8 * * *",
  },
];

/** Default Meta Ads cron jobs (only activated when the Meta connector connects). */
export const DEFAULT_META_CRON_JOBS: readonly DefaultCronJob[] = [
  {
    type: "adManager/alerts",
    sessionSlug: "adManager",
    name: "Daily Alert Audit",
    prompt: compileAlertsSystemPrompt(),
    schedule: "0 9 * * *",
  },
  {
    type: "adManager/suggestions",
    sessionSlug: "adManager",
    name: "Daily Suggestions Scan",
    prompt: compileSuggestionsSystemPrompt(),
    schedule: "0 9 * * *",
  },
  {
    type: "adManager/campaigns",
    sessionSlug: "adManager",
    name: "Daily Campaign Review",
    prompt: compileCampaignsSystemPrompt(),
    schedule: "0 9 * * *",
  },
  {
    type: "adStrategist/reports",
    sessionSlug: "adStrategist",
    name: "Daily Strategy Report",
    prompt: compileReportsSystemPrompt(),
    schedule: "0 9 * * *",
  },
];

/** Combined default autonomous cron jobs registry. */
export const DEFAULT_CRON_JOBS: readonly DefaultCronJob[] = [
  ...DEFAULT_BUSINESS_PROFILE_CRON_JOBS,
  ...DEFAULT_META_CRON_JOBS,
];
