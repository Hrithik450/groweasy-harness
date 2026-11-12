"use client";

import { connectorsFetch } from "../../../../../connectors.client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  RefreshCw,
  Loader2,
  Layers,
  Coins,
  Target,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Radio,
} from "lucide-react";
import { MetaAdSet, MetaCampaign } from "../../../../../lib/meta";
import { MetaAdSetForm } from "../../meta.adset.form";
import type { AdSetFormData } from "../../types";

interface MetaAdSetsSubTabProps {
  selectedAccountId: string;
  adAccountCurrency?: string;
}

export function MetaAdSetsSubTab({
  selectedAccountId,
  adAccountCurrency,
}: MetaAdSetsSubTabProps) {
  const [adSets, setAdSets] = useState<MetaAdSet[]>([]);
  const [availableCampaigns, setAvailableCampaigns] = useState<MetaCampaign[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingAdSetId, setEditingAdSetId] = useState<string | null>(null);
  const [deletingAdSetId, setDeletingAdSetId] = useState<string | null>(null);

  const currencySymbol = adAccountCurrency === "INR" ? "₹" : "$";

  const fetchLiveAdSets = async () => {
    if (!selectedAccountId) return;

    setIsLoading(true);
    try {
      const res = await connectorsFetch(
        `/api/connectors/meta/ad-accounts/campaigns/adsets?adAccountId=${encodeURIComponent(
          selectedAccountId,
        )}`,
      );

      const data = await res.json();
      if (res.ok && data.success) {
        const items: MetaAdSet[] = data.adsets || data.data || [];
        setAdSets(items);
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to load Meta ad sets";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("Error connecting to Meta ad sets endpoint");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLiveCampaigns = async () => {
    if (!selectedAccountId) return;

    try {
      const res = await connectorsFetch(
        `/api/connectors/meta/ad-accounts/campaigns?adAccountId=${encodeURIComponent(
          selectedAccountId,
        )}`,
      );

      const data = await res.json();
      if (res.ok && data.success) {
        setAvailableCampaigns(data.data || []);
      }
    } catch {
    }
  };

  useEffect(() => {
    fetchLiveAdSets();
    fetchLiveCampaigns();
  }, [selectedAccountId]);

  const handleCreateAdSet = async (formData: AdSetFormData) => {
    try {
      const res = await connectorsFetch(
        "/api/connectors/meta/ad-accounts/campaigns/adsets",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adAccountId: selectedAccountId,
            campaignId: formData.campaignId,
            name: formData.name,
            status: formData.status || "PAUSED",
            dailyBudget: formData.dailyBudget
              ? Number(formData.dailyBudget)
              : undefined,
            optimizationGoal: formData.optimizationGoal,
            billingEvent: formData.billingEvent,
          }),
        },
      );

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Ad Set created on Meta! ID: ${data.id || ""}`);
        setShowCreateForm(false);
        fetchLiveAdSets();
        return true;
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to create ad set on Meta";
        toast.error(errorMsg);
        return false;
      }
    } catch {
      toast.error("Network error while creating ad set");
      return false;
    }
  };

  const handleUpdateAdSet = async (
    adSetId: string,
    formData: AdSetFormData,
  ) => {
    try {
      const res = await connectorsFetch(
        "/api/connectors/meta/ad-accounts/campaigns/adsets",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adSetId,
            name: formData.name,
            status: formData.status,
            dailyBudget: formData.dailyBudget
              ? Number(formData.dailyBudget)
              : undefined,
          }),
        },
      );

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Ad Set updated successfully on Meta!");
        setEditingAdSetId(null);
        fetchLiveAdSets();
        return true;
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to update ad set on Meta";
        toast.error(errorMsg);
        return false;
      }
    } catch {
      toast.error("Network error while updating ad set");
      return false;
    }
  };

  const handleDeleteAdSet = async (adSetId: string, adSetName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete ad set "${adSetName}" on Meta? This action is permanent.`,
      )
    ) {
      return;
    }

    setDeletingAdSetId(adSetId);
    try {
      const res = await connectorsFetch(
        `/api/connectors/meta/ad-accounts/campaigns/adsets?adSetId=${encodeURIComponent(
          adSetId,
        )}`,
        {
          method: "DELETE",
        },
      );

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Ad Set "${adSetName}" deleted successfully on Meta`);
        if (editingAdSetId === adSetId) {
          setEditingAdSetId(null);
        }
        fetchLiveAdSets();
      } else {
        const errorMsg =
          typeof data.error === "object"
            ? data.error?.message
            : data.error || "Failed to delete ad set on Meta";
        toast.error(errorMsg);
      }
    } catch {
      toast.error("Network error while deleting ad set");
    } finally {
      setDeletingAdSetId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Sub-tab Action Bar */}
      <div className="h-8 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Ad Sets</span>
          <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-none bg-muted border border-border">
            {adSets.length} {adSets.length === 1 ? "Ad Set" : "Ad Sets"}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              fetchLiveAdSets();
              fetchLiveCampaigns();
            }}
            disabled={isLoading}
            className="p-1.5 text-muted-foreground hover:text-foreground bg-card hover:bg-muted rounded-none border border-border transition-colors cursor-pointer"
            title="Refresh ad sets"
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
            <span>New Ad Set</span>
          </button>
        </div>
      </div>

      {/* Quick Create Form Component */}
      {showCreateForm && (
        <MetaAdSetForm
          mode="create"
          availableCampaigns={availableCampaigns}
          onSubmit={handleCreateAdSet}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {/* Ad Sets Listing */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center text-muted-foreground space-y-2">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          <span className="text-xs">
            Fetching ad sets from Meta Graph API...
          </span>
        </div>
      ) : adSets.length === 0 ? (
        <div className="p-5 sm:p-6 border border-border rounded-none bg-muted text-center space-y-2">
          <Layers className="w-6 h-6 text-muted-foreground mx-auto" />
          <h4 className="text-sm font-semibold text-foreground">
            No Ad Sets Found
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            No active or draft ad sets were found on this ad account. Click
            &quot;New Ad Set&quot; above to create an audience ad set under an
            existing campaign.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {adSets.map((adSet) => {
            const isEditing = editingAdSetId === adSet.id;
            const budget = adSet.budgetFormatted
              ? adSet.budgetFormatted
              : adSet.dailyBudget
                ? `${currencySymbol}${adSet.dailyBudget.toLocaleString("en-IN")}/day`
                : adSet.lifetimeBudget
                  ? `${currencySymbol}${adSet.lifetimeBudget.toLocaleString("en-IN")} lifetime`
                  : null;

            if (isEditing) {
              return (
                <div
                  key={adSet.id}
                  className="bg-card border border-border rounded-none p-3 sm:p-3.5 w-full"
                >
                  <MetaAdSetForm
                    mode="edit"
                    initialData={adSet}
                    availableCampaigns={availableCampaigns}
                    onSubmit={(formData) =>
                      handleUpdateAdSet(adSet.id!, formData)
                    }
                    onCancel={() => setEditingAdSetId(null)}
                    onDelete={() =>
                      handleDeleteAdSet(adSet.id!, adSet.name || "Ad Set")
                    }
                    isDeleting={deletingAdSetId === adSet.id}
                  />
                </div>
              );
            }

            return (
              <div
                key={adSet.id}
                className="bg-card border border-border hover:border-input rounded-none p-3 sm:p-3.5 transition-all space-y-2.5 w-full"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-foreground leading-snug truncate">
                      {adSet.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {adSet.id && (
                        <span className="text-xs text-muted-foreground font-mono">
                          ID: {adSet.id}
                        </span>
                      )}
                      {(adSet.campaignName || adSet.campaignId) && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-none font-medium">
                          <Radio className="w-3 h-3 text-muted-foreground" />
                          <span>
                            {adSet.campaignName || `Campaign: ${adSet.campaignId}`}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {adSet.status && (
                      <span
                        className={`px-2.5 py-0.5 rounded-none text-[11px] font-semibold ${
                          adSet.status === "ACTIVE"
                            ? "bg-success-tint text-success border border-success/25"
                            : adSet.status === "PAUSED"
                              ? "bg-warning-tint text-warning border border-warning/30"
                              : adSet.status === "ARCHIVED"
                                ? "bg-info-tint text-info border border-info/25"
                                : adSet.status === "DELETED"
                                  ? "bg-destructive-tint text-destructive border border-destructive/25"
                                  : "bg-secondary text-foreground border border-border"
                        }`}
                      >
                        {adSet.status}
                      </span>
                    )}

                    {adSet.status !== "DELETED" && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingAdSetId(adSet.id || null)}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-none transition-colors cursor-pointer"
                          title="Edit Ad Set"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteAdSet(adSet.id!, adSet.name || "Ad Set")
                          }
                          disabled={deletingAdSetId === adSet.id}
                          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive-tint rounded-none transition-colors cursor-pointer"
                          title="Delete Ad Set"
                        >
                          {deletingAdSetId === adSet.id ? (
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
                  {adSet.optimizationGoal && (
                    <div className="flex items-center gap-1 text-foreground font-medium">
                      <Target className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{adSet.optimizationGoal.replace(/_/g, " ")}</span>
                    </div>
                  )}

                  {budget && (
                    <div className="flex items-center gap-1.5 text-foreground font-semibold">
                      <Coins className="w-3.5 h-3.5 text-brand" />
                      <span>{budget}</span>
                    </div>
                  )}

                  {adSet.billingEvent && (
                    <span className="px-2 py-0.5 rounded-none bg-secondary text-[11px] text-muted-foreground">
                      {adSet.billingEvent}
                    </span>
                  )}

                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs ml-auto">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {adSet.createdTime
                        ? new Date(adSet.createdTime).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )
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
