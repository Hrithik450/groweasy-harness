import type { SessionView } from "@openai-harness/session";
import type { DetailBarType, AdManagerAlert } from "./types";
export { formatAlertTimestamp } from "./date";

type LegacyAlertFields = {
  campaignId?: string;
  adSetId?: string;
  adId?: string;
};

export function buildAlertFixPrompt(
  alert: AdManagerAlert,
): string {
  const legacyAlert = alert as AdManagerAlert & LegacyAlertFields;
  const campaignId = alert.meta?.campaignId || legacyAlert.campaignId || "";
  const adAccountId = alert.meta?.adAccountId;
  const adSetId = alert.meta?.adSetId || legacyAlert.adSetId;
  const adId = alert.meta?.adId || legacyAlert.adId;
  const action = typeof alert.action === "object" ? alert.action : null;
  const actionFix = action ? action.fix : String(alert.action || "");

  const contextLines = [
    `- Alert ID: ${alert.id}`,
    `- Alert Title: ${alert.title}`,
    `- Alert Severity: ${alert.severity}`,
    `- Alert Description: ${alert.description}`,
    `- Campaign ID: ${campaignId}`,
  ];

  if (adAccountId) contextLines.push(`- Ad Account ID: ${adAccountId}`);
  if (adSetId) contextLines.push(`- Ad Set ID: ${adSetId}`);
  if (adId) contextLines.push(`- Ad ID: ${adId}`);
  if (action?.before) contextLines.push(`- Before: ${action.before}`);
  if (action?.after) contextLines.push(`- After: ${action.after}`);
  contextLines.push(`- Recommended Action: ${actionFix}`);

  return `The user tapped "Fix with AI" on this alert. Execute the recommended fix or action:
${contextLines.join("\n")}
Apply the recommended action.
- Executed successfully: call updateAlerts with alertId '${alert.id}', status 'completed'.
- Attempted but failed: call updateAlerts with alertId '${alert.id}', status 'error'.
- Needs human action (can't be done automatically): tell the user why and do NOT call updateAlerts. The alert stays pending.
Never mark 'completed' unless the action was actually executed and successfully completed without any errors.`;
}

/**
 * Resolves the strongly-typed detailBarType identifier for a session.
 * 1. Checks session.slug directly.
 * 2. Falls back to the folded `detailBar.type` projection.
 * 3. Defaults to "default".
 */
export function resolveDetailBarType(
  session?: SessionView | null,
  detailBarType?: string | null,
): DetailBarType {
  if (session?.slug && typeof session.slug === "string") {
    return session.slug as DetailBarType;
  }

  if (typeof detailBarType === "string" && detailBarType.length > 0) {
    return detailBarType as DetailBarType;
  }

  return "default";
}
