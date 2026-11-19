/**
 * Instructions and tools for one session turn.
 *
 * Capability belongs to the session slug, not to the caller: a human prompt, a
 * cron job, and a system route all compose the same way.
 *
 * @module @/lib/core/agent/compose.turn
 */

import type { Session } from "@/lib/db";
import type { ModelToolSchema } from "@/lib/llm/llm/driver";
import {
  compileBusinessProfilePrompt,
  compileSystemPrompt,
} from "@/lib/prompts";
import { getConnectorByUserIdAndSlug } from "@/lib/repositories/connectors.repo";
import { getToolDefinitionsForSlug } from "@/lib/tools";

export interface TurnComposition {
  instructions: string;
  tools: readonly ModelToolSchema[];
}

/** Tabs a surface owns, and the tool plus skill that fills each one. */
const SURFACE_TABS: Record<string, ReadonlyArray<string>> = {
  adManager: [
    "Campaigns — synced from Meta, metrics derived by the app; classify each ad with `updateCampaignAds`",
    "Alerts — `updateAlerts` (max 5 per run, only new or changed)",
    "Suggestions — `updateSuggestions` (max 5 per run, ranked by money)",
  ],
  adCreator: [
    "Ideas — `updateIdeas` (max 10 per run, newest first)",
    "Creatives — `updateCreatives` (finished image or video assets)",
  ],
  adStrategist: [
    "Daily reports — `updateReports` (one UI-block report per day)",
    "Campaign brief — `updateCampaignBriefs` (one brief per campaign plan)",
    "Competitor research — `updateCompetitorResearch` (only new findings)",
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

/** Instructions and tools for one session, chosen by its slug. */
export function composeTurn(session: Session): TurnComposition {
  const tools = getToolDefinitionsForSlug(session.slug);

  if (session.slug === "businessProfile") {
    const connector = getConnectorByUserIdAndSlug(
      session.userId,
      "businessProfile",
    );
    const brandUrl = (connector?.metadata as { url?: unknown } | null)?.url;
    if (typeof brandUrl === "string" && brandUrl.trim().length > 0) {
      return {
        instructions: compileBusinessProfilePrompt(brandUrl.trim()),
        tools,
      };
    }
  }

  const instructions = `${compileSystemPrompt(session.title)}${surfaceSection(session.slug)}`;
  return { instructions, tools };
}
