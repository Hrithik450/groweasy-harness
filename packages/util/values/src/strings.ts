/**
 * Small stateless string helpers shared by host-side consumers.
 *
 * @module @openai-harness/util-values
 */

/**
 * Sanitizes a user ID to prevent path traversal or filesystem issues.
 * @param userId - raw user identifier.
 * @returns the identifier reduced to `[a-zA-Z0-9_-]`, or an empty string.
 */
export function sanitizeUserId(userId?: string): string {
  if (!userId) return "";
  const clean = userId.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return clean;
}

/**
 * Converts a camelCase slug (e.g. "adManager") into a display title ("Ad Manager").
 * @param slug - camelCase slug.
 * @returns space-separated title-case text.
 */
export function slugToTitle(slug: string): string {
  return slug
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
