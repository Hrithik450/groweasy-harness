/**
 * Hidden prompt a user sends when they accept an ad's recommended move.
 *
 * Client-safe: no filesystem or registry access, so UI components can import
 * this module without pulling the server-only prompt compiler into the bundle.
 *
 * @module @/lib/prompts/campaign.ad
 */

import type {
  Campaign,
  CampaignAd,
  CampaignAdAction,
} from "@/lib/detail.bar/types";
import type { PromptDraft } from "@/lib/session/prompt";

/** Prompt instructing the agent to apply one ad's recommended move. */
export function buildCampaignAdPrompt(
  campaign: Campaign,
  ad: CampaignAd,
  action: CampaignAdAction,
): PromptDraft {
  const lines = [
    `Apply the recommended move for ad "${ad.name}" in campaign "${campaign.name}".`,
    `Verdict: ${ad.category}.`,
    `Move: ${action.fix}`,
  ];
  if (ad.siblingComparison) lines.push(`Performance: ${ad.siblingComparison}`);
  if (ad.resultShare) lines.push(`Share: ${ad.resultShare}`);
  if (action.before !== undefined) lines.push(`Current value: ${action.before}`);
  if (action.after !== undefined) lines.push(`Target value: ${action.after}`);
  if (ad.value) lines.push(`Expected value: ${ad.value}`);
  lines.push(
    "Verify the current state before changing anything, then apply the change with the matching Meta tool.",
  );
  return {
    content: lines.join("\n"),
    display: {
      title: `Apply the move for “${ad.name}”`,
      detail: ad.category,
    },
  };
}
