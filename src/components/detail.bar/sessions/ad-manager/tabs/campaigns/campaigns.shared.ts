import type { Campaign, CampaignChips } from "@/lib/detail.bar/types";

function statusKey(campaign: Campaign): string {
  return (campaign.metaStatus ?? "").trim().toLowerCase();
}

/** Card and panel chip text; the stored status already reads like a label. */
export function campaignStatusLabel(campaign: Campaign): string {
  return campaign.metaStatus?.trim() || "Campaign";
}

export function isDraftCampaign(campaign: Campaign): boolean {
  return statusKey(campaign) === "draft";
}

export function statusChipClass(campaign: Campaign): string {
  switch (statusKey(campaign)) {
    case "active":
      return "bg-success-tint text-success border border-success-border";
    case "paused":
      return "bg-warning-tint text-warning border border-warning-border";
    case "draft":
      return "bg-accent text-foreground border border-accent-hover";
    case "deleted":
    case "failed":
      return "bg-destructive-tint text-destructive border border-destructive-border";
    default:
      return "bg-secondary text-foreground border border-border";
  }
}

/** Chips are the ad categories counted, so the card cannot drift from its panel. */
export function campaignChips(campaign: Campaign): CampaignChips | undefined {
  if (!campaign.ads?.length) return undefined;

  const chips: CampaignChips = {};
  for (const ad of campaign.ads) {
    if (ad.category === "winner") chips.winners = (chips.winners ?? 0) + 1;
    if (ad.category === "scaler") chips.scalers = (chips.scalers ?? 0) + 1;
    if (ad.category === "loser") chips.losers = (chips.losers ?? 0) + 1;
    if (ad.category === "potential") {
      chips.potential = (chips.potential ?? 0) + 1;
    }
  }

  return Object.keys(chips).length > 0 ? chips : undefined;
}
