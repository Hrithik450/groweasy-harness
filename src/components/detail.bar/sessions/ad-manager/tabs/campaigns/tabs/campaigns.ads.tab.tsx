"use client";

import { useState } from "react";
import { ArrowLeft, Radio } from "lucide-react";
import { toast } from "sonner";
import { buildCampaignAdPrompt } from "@/lib/prompts/campaign.ad";
import { formatCompact, formatRoas } from "@/lib/utils/metrics.format";
import { useBarPager } from "@/hooks/use.bar.pager";
import type {
  AdManagerDetailBarData,
  Campaign,
  CampaignAd,
  CampaignAdAction,
  ActionStatus,
  AdCategory,
} from "@/lib/detail.bar/types";
import { DetailBarEmptyState } from "@/components/detail.bar/common";
import type { SessionView } from "@/lib/core/session/view";
import { AdCard } from "../ad.card";
import { campaignStatusLabel, statusChipClass } from "../campaigns.shared";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const GROUPS: { key: AdCategory; label: string }[] = [
  { key: "winner", label: "Winners" },
  { key: "scaler", label: "Scalers" },
  { key: "loser", label: "Losers" },
  { key: "potential", label: "Potential" },
  { key: "untested", label: "Untested" },
];

export interface CampaignsAdsTabProps {
  campaignId: string;
  data: AdManagerDetailBarData;
  session?: SessionView;
  isStreaming?: boolean;
  handleSubmit?: (
    content: string,
    options?: { source?: import("@/lib/session/prompt").PromptSource },
  ) => Promise<void> | void;
  handleUpdateData?: (
    newData: Partial<AdManagerDetailBarData>,
    item?: { kind: "campaigns"; id: string; patch: Record<string, unknown> },
  ) => Promise<void>;
  onBack: () => void;
}

/**
 * One campaign's ads: the only nested tab level (campaigns.ads).
 *
 * The bar owns the drill state and the header tabs; this tab resolves the
 * campaign from the same store the list uses and renders only its ads.
 */
export function CampaignsAdsTab({
  campaignId,
  data,
  session,
  isStreaming,
  handleSubmit,
  handleUpdateData,
  onBack,
}: CampaignsAdsTabProps) {
  const [pendingAdId, setPendingAdId] = useState<string | null>(null);
  const [statusByAd, setStatusByAd] = useState<Record<string, ActionStatus>>(
    {},
  );

  const pager = useBarPager(
    session?.id ?? "",
    "campaigns",
    data.campaigns ?? [],
  );
  const campaign: Campaign | undefined = pager.items.find(
    (row) => (row.id || row.name) === campaignId,
  );

  if (!campaign) {
    return (
      <div className="space-y-3 pb-6">
        <BackButton label="All campaigns" onBack={onBack} />
        <DetailBarEmptyState
          icon={Radio}
          title="Campaign not found"
          description="It may have been removed or trimmed."
        />
      </div>
    );
  }

  const ads = Array.isArray(campaign.ads) ? campaign.ads : [];
  const groups = GROUPS.map((group) => ({
    ...group,
    ads: ads.filter((ad) => ad.category === group.key),
  })).filter((group) => group.ads.length > 0);

  const statusOf = (ad: CampaignAd): ActionStatus =>
    statusByAd[ad.id] ?? ad.action?.status ?? "pending";

  const saveStatus = (ad: CampaignAd, status: ActionStatus) => {
    setStatusByAd((current) => ({ ...current, [ad.id]: status }));
    const nextAds = campaign.ads?.map((row) =>
      row.id === ad.id && row.action
        ? { ...row, action: { ...row.action, status } }
        : row,
    );
    const campaigns = (data.campaigns ?? []).map((row) =>
      (row.id || row.name) === campaignId ? { ...row, ads: nextAds } : row,
    );
    void handleUpdateData?.(
      { campaigns },
      { kind: "campaigns", id: ad.id, patch: { status } },
    ).catch(() => toast.error("Failed to save the change"));
  };

  const runAction = async (ad: CampaignAd, action: CampaignAdAction) => {
    if (isStreaming || pendingAdId) return;
    setPendingAdId(ad.id);
    try {
      await handleSubmit?.(buildCampaignAdPrompt(campaign, ad, action), {
        source: "detail-bar",
      });
      saveStatus(ad, "completed");
      toast.success("Sent to the assistant");
    } catch (err) {
      console.error("Failed to run campaign action:", err);
      toast.error("Failed to run the action");
    } finally {
      setPendingAdId(null);
    }
  };

  const metrics = campaign.metrics ?? {};
  const stats: { label: string; value: string }[] = [
    { label: "Spend", value: metrics.spend || "—" },
    {
      label: "Purchases",
      value: formatCompact(metrics.purchases ?? metrics.leads) || "—",
    },
    { label: "CPA", value: metrics.cpa || metrics.cpl || "—" },
    { label: "ROAS", value: formatRoas(metrics.roas) || "—" },
  ];

  return (
    <div className="space-y-3 pb-6 panel-slide-in-right">
      <BackButton label="All campaigns" onBack={onBack} />

      <header className="border border-border bg-card rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 font-display font-bold text-[13.5px] text-foreground leading-snug break-words line-clamp-2">
            {campaign.name}
          </h3>
          <span
            className={`shrink-0 px-2 py-0.5 text-[11px] font-bold uppercase rounded-none ${statusChipClass(
              campaign,
            )}`}
          >
            {campaignStatusLabel(campaign)}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 tabular-nums">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col min-w-0">
              <span className="text-[10.5px] text-muted-foreground truncate">
                {stat.label}
              </span>
              <span className="font-bold text-[12px] text-foreground truncate">
                {stat.value}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug">
          Last 7 days · each ad compared with the other ads in its ad set
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          No ad-level verdicts saved for this campaign yet. Ask the assistant
          for a campaign health check.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider font-mono text-muted-foreground">
                {group.label}
              </span>
              <span className="flex-1 h-px bg-border" />
              <span className="shrink-0 text-[10.5px] font-mono text-muted-2">
                {group.ads.length}
              </span>
            </div>

            <div className="space-y-2">
              {group.ads.map((ad) => (
                <AdCard
                  key={ad.id}
                  ad={ad}
                  busy={pendingAdId === ad.id}
                  disabled={Boolean(isStreaming || pendingAdId)}
                  status={statusOf(ad)}
                  onAction={runAction}
                  onIgnore={(target) => {
                    if (target.action?.status === "ignored") return;
                    saveStatus(target, "ignored");
                  }}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer ${FOCUS_RING}`}
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
