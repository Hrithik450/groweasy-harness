/**
 * Hidden prompt a user sends when they accept an alert's suggested fix.
 *
 * Client-safe: no filesystem or registry access, so UI components can import
 * this module without pulling the server-only prompt compiler into the bundle.
 *
 * @module @/lib/prompts/alert
 */

import type { Alert } from "@/lib/detail.bar/types";
import type { PromptDraft } from "@/lib/session/prompt";

/** One-line scope description for the alert's target entity. */
function describeTarget(alert: Alert): string {
  const { adAccountId, campaignId, adSetId, adId } = alert.meta;
  const parts = [`ad account ${adAccountId}`, `campaign ${campaignId}`];
  if (adSetId) parts.push(`ad set ${adSetId}`);
  if (adId) parts.push(`ad ${adId}`);
  return parts.join(", ");
}

/** Prompt instructing the agent to apply the alert's recommended fix. */
export function buildAlertPrompt(alert: Alert): PromptDraft {
  const lines = [
    `Apply the recommended fix for alert "${alert.title}" (${alert.severity}).`,
    `Scope: ${describeTarget(alert)}.`,
    `Issue: ${alert.description}`,
    `Fix: ${alert.action.fix}`,
  ];
  if (alert.action.before !== undefined) {
    lines.push(`Current value: ${alert.action.before}`);
  }
  if (alert.action.after !== undefined) {
    lines.push(`Target value: ${alert.action.after}`);
  }
  lines.push(
    "Verify the current state before changing anything, apply the change with the matching Meta tool, then mark the alert resolved with updateAlert.",
  );
  return {
    content: lines.join("\n"),
    display: {
      title: `Apply the fix for “${alert.title}”`,
      detail: alert.severity,
    },
  };
}
