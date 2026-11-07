/**
 * Saved competitor research history.
 *
 * Reads the adStrategist session's whole detail-bar state (checkpoint plus log
 * tail) and returns its saved researches, optionally scoped to one brand
 * domain. The read is derived from the committed event log, so a missing
 * session or state simply means no history yet and failures degrade to an empty
 * list.
 *
 * @module @openai-harness/tool-meta/competitor-research/history
 */

import type {
  AdStrategistDetailBarData,
  CompetitorResearchItem,
} from "@openai-harness/client-ui-detail-bar";
import {
  getSessionByUserIdAndSlug,
  readDetailBarState,
} from "@openai-harness/session-persistence";
import { normalizeDomainOrUrl } from "@openai-harness/scraper";

/**
 * Retrieve every saved competitor research report for the user's adStrategist
 * session, optionally filtered to a brand.
 *
 * @param userId - owner of the session.
 * @param brandUrl - optional brand domain or URL to match.
 * @returns matching reports, newest order unchanged.
 */
export async function getCompetitorResearches(
  userId?: string,
  brandUrl?: string,
): Promise<CompetitorResearchItem[]> {
  const researches: CompetitorResearchItem[] = [];
  if (!userId) return researches;

  try {
    const result = await getSessionByUserIdAndSlug(userId, "adStrategist");
    const session = result.data;
    if (!session) return researches;

    const targetBrandUrl = brandUrl ? normalizeDomainOrUrl(brandUrl) : "";
    const { state } = await readDetailBarState(session.id, "adStrategist");
    const detailBarData = state.data as unknown as AdStrategistDetailBarData;

    const allResearches: CompetitorResearchItem[] =
      detailBarData.competitorResearches ?? [];

    for (const research of allResearches) {
      if (targetBrandUrl && research.brandUrl) {
        if (normalizeDomainOrUrl(research.brandUrl) !== targetBrandUrl) {
          continue;
        }
      }
      researches.push(research);
    }
  } catch (err) {
    console.warn("Failed to get competitor researches:", err);
  }

  return researches;
}
