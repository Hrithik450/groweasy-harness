"use client";

import { connectorsFetch } from "../../../../../connectors.client";
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
import { MetaCampaign } from "../../../../../lib/meta";
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
      const res = await connectorsFetch("/api/connectors/meta/ad-accounts/campaigns", {
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
      const res = await connectorsFetch("/api/connectors/meta/ad-accounts/campaigns", {
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
      const res = await connectorsFetch(
        `/api/connectors/meta/ad-accounts/campaigns?campaignId=${encodeURIComponent(
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
      const res = await connectorsFetch(
        `/api/connectors/meta/ad-accounts/campaigns?adAccountId=${encodeURIComponent(
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
      <div className="h-8 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Campaigns</span>
          <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-muted border border-border">
            {campaigns.length}{" "}
            {campaigns.length === 1 ? "Campaign" : "Campaigns"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={fetchLiveCampaigns}
            disabled={isLoading}
            className="p-1.5 text-muted-foreground hover:text-foreground bg-card hover:bg-muted rounded-none border border-border transition-colors cursor-pointer"
            title="Refresh campaigns"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isLoading ? "animate-spin text-brand" : ""
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-brand hover:bg-brand-hover text-primary-foreground rounded-none transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Campaign</span>
          </button>
        </div>
      </div>

      {/* Quick Create Form Component */}
      {showCreateForm && (
        <MetaCampaignForm
          mode="create"
          onSubmit={handleCreateCampaign}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          <span className="text-xs">Fetching campaigns from Meta...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="p-5 sm:p-6 border border-border rounded-none bg-muted text-center space-y-2">
          <Radio className="w-6 h-6 text-muted-foreground mx-auto" />
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
                  className="bg-card border border-border rounded-none p-3 sm:p-3.5 w-full"
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
                className="bg-card border border-border hover:border-input rounded-none p-3 sm:p-3.5 transition-all space-y-2.5 w-full"
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
                            ? "bg-success-tint text-success border border-success/25"
                            : camp.status === "PAUSED"
                              ? "bg-warning-tint text-warning border border-warning/30"
                              : camp.status === "ARCHIVED"
                                ? "bg-info-tint text-info border border-info/25"
                                : camp.status === "DELETED"
                                  ? "bg-destructive-tint text-destructive border border-destructive/25"
                                  : "bg-secondary text-foreground border border-border"
                        }`}
                      >
                        {camp.status}
                      </span>
                    )}

                    {camp.status !== "DELETED" && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingCampaignId(camp.id || null)}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors cursor-pointer"
                          title="Edit Campaign"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteCampaign(camp.id!, camp.name)
                          }
                          disabled={deletingCampaignId === camp.id}
                          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive-tint rounded-none transition-colors cursor-pointer"
                          title="Delete Campaign"
                        >
                          {deletingCampaignId === camp.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t border-border flex-wrap">
                  <span className="px-2 py-0.5 rounded-none bg-secondary text-xs text-foreground font-medium">
                    {camp.objective
                      ? camp.objective.replace("OUTCOME_", "")
                      : "TRAFFIC"}
                  </span>

                  {budget && (
                    <div className="flex items-center gap-1.5 text-foreground font-semibold">
                      <Coins className="w-3.5 h-3.5 text-brand" />
                      <span>{budget}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs ml-auto">
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
