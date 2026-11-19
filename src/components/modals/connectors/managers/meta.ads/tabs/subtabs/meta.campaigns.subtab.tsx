"use client";

import {
  Plus,
  Radio,
  Clock,
  Coins,
  Loader2,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { CampaignFormData } from "../../types";
import type { MetaCampaign } from "@/lib/connectors/meta.ads/types";
import { MetaCampaignForm } from "../../meta.campaign.form";

interface MetaCampaignsSubTabProps {
  selectedAdAccountId: string;
}

export function MetaCampaignsSubTab({
  selectedAdAccountId,
}: MetaCampaignsSubTabProps) {
  const [isLoading, setIsLoading] = useState(false);

  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(
    null,
  );
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(
    null,
  );

  const handleCreateCampaign = async (formData: CampaignFormData) => {
    try {
      const res = await fetch("/api/connectors/meta.ads/ad-accounts/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          objective: formData.objective,
          adAccountId: selectedAdAccountId,
          dailyBudget: formData.dailyBudget
            ? Number(formData.dailyBudget)
            : undefined,
          status: formData.status || "PAUSED",
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const campaignId = data.data?.id || data.id;
        toast.success(`Campaign created on Meta! ID: ${campaignId}`);
        setShowCreateForm(false);
        fetchLiveCampaigns();
        return true;
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to create campaign on Meta";
        toast.error(errorMsg);
        return false;
      }
    } catch {
      toast.error("Network error while creating campaign");
      return false;
    }
  };

  const handleUpdateCampaign = async (
    campaignId: string,
    formData: CampaignFormData,
  ) => {
    try {
      const res = await fetch("/api/connectors/meta.ads/ad-accounts/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          name: formData.name,
          status: formData.status,
          dailyBudget: formData.dailyBudget
            ? Number(formData.dailyBudget)
            : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Campaign updated successfully on Meta!");
        setEditingCampaignId(null);
        fetchLiveCampaigns();
        return true;
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to update campaign on Meta";
        toast.error(errorMsg);
        return false;
      }
    } catch {
      toast.error("Network error while updating campaign");
      return false;
    }
  };

  const handleDeleteCampaign = async (
    campaignId: string,
    campaignName: string,
  ) => {
    if (
      !window.confirm(
        `Are you sure you want to delete campaign "${campaignName}" on Meta? This action is permanent.`,
      )
    ) {
      return;
    }

    setDeletingCampaignId(campaignId);
    try {
      const res = await fetch(
        `/api/connectors/meta.ads/ad-accounts/campaigns?campaignId=${encodeURIComponent(
          campaignId,
        )}`,
        {
          method: "DELETE",
        },
      );

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          `Campaign "${campaignName}" deleted successfully on Meta`,
        );
        if (editingCampaignId === campaignId) {
          setEditingCampaignId(null);
        }
        fetchLiveCampaigns();
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to delete campaign on Meta";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("Network error while deleting campaign");
    } finally {
      setDeletingCampaignId(null);
    }
  };

  const fetchLiveCampaigns = async () => {
    if (!selectedAdAccountId) return;

    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/connectors/meta.ads/ad-accounts/campaigns?adAccountId=${encodeURIComponent(
          selectedAdAccountId,
        )}`,
      );

      const data = await res.json();
      if (res.ok && data.success) {
        const items: MetaCampaign[] = data.data || [];
        setCampaigns(items);
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to load Meta campaigns";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("Error connecting to Meta campaign endpoint");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveCampaigns();
  }, [selectedAdAccountId]);

  return (
    <div className="space-y-3">
      <div className="h-8 w-full flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            Campaigns
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-linen border border-border/80 shadow-2xs">
            {campaigns.length}{" "}
            {campaigns.length === 1 ? "Campaign" : "Campaigns"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={fetchLiveCampaigns}
            disabled={isLoading}
            className="p-1.5 text-muted-foreground hover:text-foreground bg-card hover:bg-muted rounded-none border border-border transition-colors cursor-pointer"
            title="Refresh campaigns"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoading ? "animate-spin text-foreground" : ""
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-brand hover:bg-brand-hover text-primary-foreground rounded-none transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </button>
        </div>
      </div>

      {showCreateForm && (
        <MetaCampaignForm
          mode="create"
          onSubmit={handleCreateCampaign}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-2 space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-foreground" />
          <span className="text-xs">Fetching campaigns from Meta...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="p-5 sm:p-6 border border-border/80 rounded-2xl bg-linen text-center space-y-2 shadow-2xs">
          <Radio className="w-6 h-6 text-muted-2 mx-auto" />
          <h4 className="text-sm font-semibold text-foreground">
            No Campaigns Found
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            No active or draft campaigns were returned for this ad account.
            Click &quot;New Campaign&quot; above to create one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {campaigns.map((camp) => {
            const budget = camp.budgetFormatted;
            const dateStr = camp.createdTime;
            const isEditing = editingCampaignId === camp.id;

            if (isEditing) {
              return (
                <div
                  key={camp.id}
                  className="bg-card border border-border/80 rounded-2xl p-3 sm:p-3.5 shadow-2xs w-full"
                >
                  <MetaCampaignForm
                    mode="edit"
                    initialData={camp}
                    onSubmit={(formData) =>
                      handleUpdateCampaign(camp.id!, formData)
                    }
                    onCancel={() => setEditingCampaignId(null)}
                    onDelete={() => handleDeleteCampaign(camp.id!, camp.name)}
                    isDeleting={deletingCampaignId === camp.id}
                  />
                </div>
              );
            }

            return (
              <div
                key={camp.id}
                className="bg-card border border-border/80 hover:border-border-strong rounded-2xl p-3 sm:p-3.5 transition-all space-y-2.5 shadow-2xs w-full"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground leading-snug truncate">
                      {camp.name}
                    </h4>
                    {camp.id && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ID: {camp.id}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {camp.status && (
                      <span
                        className={`px-2.5 py-0.5 rounded-none text-[11px] font-semibold ${
                          camp.status === "ACTIVE"
                            ? "bg-success-tint text-success border border-success-border"
                            : camp.status === "PAUSED"
                              ? "bg-warning-tint text-warning border border-warning-border"
                              : camp.status === "ARCHIVED"
                                ? "bg-accent-tint text-accent-strong border border-accent/30"
                                : camp.status === "DELETED"
                                  ? "bg-destructive-tint text-destructive-strong border border-destructive-border"
                                  : "bg-muted text-foreground border border-border"
                        }`}
                      >
                        {camp.status}
                      </span>
                    )}

                    {camp.status !== "DELETED" && (
                      <button
                        type="button"
                        onClick={() => setEditingCampaignId(camp.id || null)}
                        className="p-1 text-muted-2 hover:text-foreground hover:bg-muted rounded-none transition-colors cursor-pointer"
                        title="Edit Campaign"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {camp.status !== "DELETED" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDeleteCampaign(camp.id!, camp.name)
                        }
                        disabled={deletingCampaignId === camp.id}
                        className="p-1 text-muted-2 hover:text-destructive-strong hover:bg-destructive-tint rounded-md transition-colors cursor-pointer"
                        title="Delete Campaign"
                      >
                        {deletingCampaignId === camp.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-destructive-strong" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t border-border-subtle flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-muted text-xs text-foreground font-medium">
                    {camp.objective
                      ? camp.objective.replace("OUTCOME_", "")
                      : "TRAFFIC"}
                  </span>

                  {budget && (
                    <div className="flex items-center gap-1.5 text-foreground font-semibold">
                      <Coins className="w-3.5 h-3.5 text-forest" />
                      <span>{budget}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-muted-2 text-xs ml-auto">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {dateStr
                        ? new Date(dateStr).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Recently"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
