/**
 * The app's wall-clock zone. Timestamps are stored as UTC ISO-8601 everywhere;
 * this zone is only for turning a human-facing time (a cron expression, a
 * label) into an instant, and back.
 */
export const APP_TIME_ZONE = "Asia/Kolkata";

export const SESSION_SLUGS = [
  "adManager",
  "adCreator",
  "adStrategist",
  "businessProfile",
] as const;

export const CONNECTOR_SLUGS = [
  "metaAds",
  "shopify",
  "businessProfile",
] as const;
