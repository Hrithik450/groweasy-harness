/**
 * System instructions for one session turn.
 *
 * Capability belongs to the session slug, not to the caller: a human prompt, a
 * cron job, and a system route all compose the same way.
 *
 * @module @/lib/core/agent/compose.turn
 */

import type { Session } from "@/lib/db";
import {
  compileBusinessProfilePrompt,
  compileSystemPrompt,
} from "@/lib/prompts";
import { getConnectorByUserIdAndSlug } from "@/lib/repositories/connectors.repo";
import { getSkillUpdates, SkillUpdatesPrompt } from "@/lib/skills/updates";

/** Tabs a surface owns, and the tool plus skill that fills each one. */
const SURFACE_TABS: Record<string, ReadonlyArray<string>> = {
  adManager: [
    "Campaigns — synced from Meta, metrics derived by the app; classify each ad with `upsertAdsClassified`",
    "Alerts — `updateAlerts` (max 5 per run, only new or changed)",
    "Suggestions — `updateSuggestions` (max 5 per run, ranked by money)",
  ],
  adCreator: [
    "Ideas — `updateIdeas` (max 10 per run, newest first)",
    "Creatives — `updateCreatives` (finished image or video assets)",
  ],
  adStrategist: [
    "Daily reports — `updateDailyReport` (one UI-block report per day)",
    "Campaign brief — `updateCampaignBriefs` (one brief per campaign plan)",
    "Competitor research — `saveCompetitorResearch` (only new findings)",
  ],
};

/** Tell the model which bar it is filling and how to read older rows. */
function surfaceSection(slug: string | null | undefined): string {
  const tabs = slug ? SURFACE_TABS[slug] : undefined;
  if (!tabs) return "";
  const lines = tabs.map((tab) => `- ${tab}`).join("\n");
  return [
    "",
    "## Your workspace",
    "This chat owns the detail bar on the right. It is filled only by the tools below — the reader looks at the tab, not at the chat, so never describe saved state you did not write.",
    lines,
    "Read older rows with `fetchDetailBar` (field + limit + cursor) before writing, so you do not repeat what is already there. Writes always land in this surface's own session, whichever chat the request came from.",
  ].join("\n");
}

/** System instructions for one session, re-read on each model step. */
export function composeInstructions(session: Session): string {
  const skillUpdates = SkillUpdatesPrompt(getSkillUpdates(session.id));
  const withSkillUpdates = (instructions: string): string =>
    skillUpdates ? `${skillUpdates}\n\n${instructions}` : instructions;

  if (session.slug === "businessProfile") {
    const connector = getConnectorByUserIdAndSlug(
      session.userId,
      "businessProfile",
    );
    const brandUrl = (connector?.metadata as { url?: unknown } | null)?.url;
    if (typeof brandUrl === "string" && brandUrl.trim().length > 0) {
      return withSkillUpdates(compileBusinessProfilePrompt(brandUrl.trim()));
    }
  }

  return withSkillUpdates(
    `${compileSystemPrompt(session.title)}${surfaceSection(session.slug)}`,
  );
}
