import type { AdStrategistDocument } from "../../../types";

type ClassifiedDocument = Pick<AdStrategistDocument, "icon" | "kind">;

/**
 * A document belongs under "Campaign brief" when it carries the brief icon or
 * its kind names a brief (case-insensitive), e.g. "Campaign brief" or
 * "Creative brief". Every other kind — competitor, strategy, audience, and
 * anything unknown — is research.
 *
 * This is the single classification rule any writer must use so the brief list
 * stays consistent.
 */
export function isCampaignBriefDocument(
  document: ClassifiedDocument,
): boolean {
  return document.icon === "brief" || /brief/i.test(document.kind ?? "");
}

/** Keep only the campaign-brief documents from a mixed document list. */
export function campaignBriefDocuments<T extends ClassifiedDocument>(
  documents: readonly T[],
): T[] {
  return documents.filter(isCampaignBriefDocument);
}
