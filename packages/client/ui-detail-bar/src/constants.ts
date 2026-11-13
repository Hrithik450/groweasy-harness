/**
 * Detail-bar type keys and the Meta campaign vocabulary the bars read.
 *
 * The full Graph-API enums stay in the application's connector package; this
 * package only needs the two campaign enums its data shape and demo records
 * reference.
 */

/** Session slugs that resolve to a registered detail bar. */
export const SESSION_SLUGS = [
  "adManager",
  "adCreator",
  "adStrategist",
  "businessProfile",
] as const;

export type SessionSlug = (typeof SESSION_SLUGS)[number];

/** Official Meta Campaign Objectives referenced by demo campaign records. */
export enum MetaCampaignObjective {
  OUTCOME_SALES = "OUTCOME_SALES",
}

/** Official Meta Campaign Statuses. */
export enum MetaCampaignStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  DELETED = "DELETED",
  ARCHIVED = "ARCHIVED",
}
