"use client";

import { toast } from "sonner";
import React, { useState } from "react";
import type { AdSetFormData } from "./types";
import { MetaAdSet, MetaCampaign } from "../../../lib/meta";
import { Plus, Check, Loader2, Trash2, ChevronDown } from "lucide-react";

export interface MetaAdSetFormProps {
  mode?: "create" | "edit";
  initialData?: MetaAdSet;
  availableCampaigns?: MetaCampaign[];
  onCancel: () => void;
  onSubmit: (data: AdSetFormData) => Promise<boolean | void>;
  onDelete?: () => void;
  isDeleting?: boolean;
  defaultStatus?: "PAUSED" | "ACTIVE" | string;
}

export function MetaAdSetForm({
  mode = "create",
  initialData,
  availableCampaigns = [],
  onSubmit,
  onCancel,
  onDelete,
  isDeleting = false,
  defaultStatus = "PAUSED",
}: MetaAdSetFormProps) {
  const isEdit = mode === "edit";

  const validCampaigns = availableCampaigns.filter(
    (c) => c.status !== "DELETED",
  );

  const [campaignId, setCampaignId] = useState<string>(
    initialData?.campaignId || validCampaigns[0]?.id || "",
  );
  const [name, setName] = useState<string>(initialData?.name || "");
  const [status, setStatus] = useState<string>(
    initialData?.status || defaultStatus,
  );
  const [dailyBudget, setDailyBudget] = useState<string>(
    initialData?.dailyBudget !== undefined
      ? String(initialData.dailyBudget)
      : "500",
  );
  const [optimizationGoal, setOptimizationGoal] = useState<string>(
    initialData?.optimizationGoal || "LINK_CLICKS",
  );
  const [billingEvent, setBillingEvent] = useState<string>(
    initialData?.billingEvent || "IMPRESSIONS",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter an ad set name");
      return;
    }

    if (!isEdit && !campaignId) {
      toast.error("Please select a parent campaign for this ad set");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        name: name.trim(),
        campaignId,
        status,
        dailyBudget,
        optimizationGoal,
        billingEvent,
      });

      if (result !== false && !isEdit) {
        setName("");
        setDailyBudget("500");
        setStatus(defaultStatus);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCampaignDeleted = initialData?.status === "DELETED";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-muted border border-border rounded-none p-3.5 space-y-2.5 animate-in fade-in duration-150"
    >
      <div className="flex items-center justify-between border-b border-border pb-1.5">
        <span className="text-sm font-semibold text-foreground">
          {isEdit
            ? `Edit Ad Set${initialData?.name ? ` : ${initialData.name}` : ""}`
            : "Create New Ad Set (Direct on Facebook)"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-muted-foreground hover:text-foreground text-xs font-medium cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {/* Parent Campaign Selector or Badge */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-foreground">
            Parent Campaign
          </label>
          {isEdit && (
            <span className="text-[10px] text-muted-foreground font-normal">
              Locked by Meta
            </span>
          )}
        </div>

        {isEdit ? (
          <div className="w-full bg-secondary border border-border rounded-none px-2.5 py-1.5 text-xs text-muted-foreground font-medium">
            {initialData?.campaignName ||
              (initialData?.campaignId
                ? `Campaign ID: ${initialData.campaignId}`
                : "Assigned Campaign")}
          </div>
        ) : validCampaigns.length === 0 ? (
          <div className="w-full bg-warning-tint border border-warning/30 rounded-none px-2.5 py-1.5 text-xs text-warning">
            No active or paused campaigns available. Please create a campaign
            first.
          </div>
        ) : (
          <div className="relative">
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              required
              className="w-full bg-card border border-border rounded-none pl-2.5 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:border-input appearance-none cursor-pointer"
            >
              {validCampaigns.map((camp) => (
                <option key={camp.id} value={camp.id}>
                  {camp.name}{" "}
                  {camp.objective
                    ? `(${camp.objective.replace("OUTCOME_", "")})`
                    : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Ad Set Name */}
      <div>
        <label className="text-xs font-medium text-foreground block mb-1">
          Ad Set Name
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Broad Audience - 21-45 - Pan India"
          className="w-full bg-card border border-border rounded-none px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-input focus:ring-2 focus:ring-ring/10"
        />
      </div>

      {/* Grid: Status, Daily Budget, Optimization Goal */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            {isEdit ? "Status" : "Initial Status"}
          </label>
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-card border border-border rounded-none pl-2.5 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:border-input appearance-none cursor-pointer"
            >
              <option value="ACTIVE">ACTIVE (Live)</option>
              <option value="PAUSED">PAUSED (Inactive)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">
            Daily Budget (INR)
          </label>
          <input
            type="number"
            min="100"
            step="50"
            value={dailyBudget}
            onChange={(e) => setDailyBudget(e.target.value)}
            placeholder="500"
            className="w-full bg-card border border-border rounded-none px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-input [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-foreground">
              Optimization Goal
            </label>
            {isEdit && (
              <span className="text-[10px] text-muted-foreground font-normal">
                Locked
              </span>
            )}
          </div>
          <div className="relative">
            <select
              disabled={isEdit}
              value={optimizationGoal}
              onChange={(e) => setOptimizationGoal(e.target.value)}
              className={`w-full bg-card border border-border rounded-none pl-2.5 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:border-input appearance-none ${
                isEdit
                  ? "opacity-60 cursor-not-allowed bg-secondary text-muted-foreground"
                  : "cursor-pointer"
              }`}
            >
              <option value="LINK_CLICKS">Link Clicks</option>
              <option value="IMPRESSIONS">Impressions</option>
              <option value="POST_ENGAGEMENT">Post Engagement</option>
              <option value="OFFSITE_CONVERSIONS">Conversions</option>
              <option value="LEAD_GENERATION">Lead Generation</option>
              <option value="REACH">Reach</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {isCampaignDeleted && (
        <div className="p-2 bg-destructive-tint border border-destructive/25 text-destructive rounded-none text-xs">
          This ad set is deleted on Meta and is read-only.
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <div>
          {isEdit &&
            onDelete &&
            (isCampaignDeleted ? (
              <span className="text-xs font-semibold text-destructive bg-destructive-tint px-2 py-0.5 rounded-none border border-destructive/25">
                Deleted on Meta
              </span>
            ) : (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting || isSubmitting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-destructive hover:text-destructive bg-card hover:bg-destructive-tint border border-destructive/25 hover:border-destructive/25 rounded-none transition-colors cursor-pointer"
                title="Delete Ad Set"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-destructive" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete</span>
              </button>
            ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting || isDeleting}
            className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-card hover:bg-muted border border-border rounded-none transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              isSubmitting ||
              isDeleting ||
              isCampaignDeleted ||
              (!isEdit && validCampaigns.length === 0)
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand hover:bg-brand-hover text-primary-foreground rounded-none transition-all disabled:opacity-40 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isEdit ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>
              {isEdit
                ? "Save Changes"
                : status === "ACTIVE"
                  ? "Launch Live Ad Set"
                  : "Draft Ad Set"}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
