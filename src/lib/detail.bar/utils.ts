import type { DetailBarType } from "./types";
export { formatAlertTimestamp } from "@/lib/utils/date";

/**
 * Resolves the detail-bar type for a session from its canonical slug.
 *
 * Bar data itself comes from the session projection, never `extra`.
 */
export function resolveDetailBarType(
  session?: { slug?: string | null } | null,
): DetailBarType {
  const slug = session?.slug;
  if (slug === "adManager" || slug === "adCreator" || slug === "adStrategist") {
    return slug;
  }

  return "default";
}
