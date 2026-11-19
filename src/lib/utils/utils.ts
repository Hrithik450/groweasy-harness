/**
 * Sanitizes a user ID to prevent path traversal or filesystem issues.
 */
export function sanitizeUserId(userId?: string): string {
  if (!userId) return "";
  const clean = userId.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return clean;
}

/**
 * Converts a camelCase slug (e.g. "adManager") into a display title ("Ad Manager").
 */
export function slugToTitle(slug: string): string {
  return slug
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/** Parameters the OAuth callbacks append when returning to the app. */
export const OAUTH_RETURN_PARAMS = [
  "open_connector",
  "meta_connected",
  "shopify_connected",
] as const;

/**
 * Current app path to return to after an OAuth hop.
 *
 * Callback parameters are dropped so a stale connection result cannot ride
 * into the next login and come back duplicated.
 */
export function currentReturnTo(): string {
  if (typeof window === "undefined") return "/c";
  const params = new URLSearchParams(window.location.search);
  for (const name of OAUTH_RETURN_PARAMS) params.delete(name);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}
