"use client";

import { toast } from "sonner";
import React, { useState } from "react";
import type { CampaignFormData } from "./types";
import { MetaCampaign } from "../../../lib/meta";
import { Plus, Check, Loader2, Trash2, ChevronDown } from "lucide-react";
import { MetaCampaignObjective } from "../../../lib/meta/constants";

export interface MetaCampaignFormProps {
  mode?: "create" | "edit";
  initialData?: MetaCampaign;
  onCancel: () => void;
  onSubmit: (data: CampaignFormData) => Promise<boolean | void>;
  onDelete?: () => void;
  isDeleting?: boolean;
  defaultObjective?: MetaCampaignObjective | string;
  defaultBudget?: string;
  defaultStatus?: "PAUSED" | "ACTIVE" | "ARCHIVED" | "DELETED" | string;
}

export function MetaCampaignForm({
  mode = "create",
  initialData,
  onSubmit,
  onCancel,
  onDelete,
  isDeleting = false,
  defaultObjective = MetaCampaignObjective.OUTCOME_TRAFFIC,
  defaultBudget = "500",
  defaultStatus = "PAUSED",
}: MetaCampaignFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [objective, setObjective] = useState(
    initialData?.objective || defaultObjective,
  );
  const [dailyBudget, setDailyBudget] = useState(
    initialData?.dailyBudget !== undefined
      ? String(initialData.dailyBudget)
      : defaultBudget,
  );
  const [status, setStatus] = useState(initialData?.status || defaultStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEdit = mode === "edit";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter a campaign name");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        name: name.trim(),
        objective,
        dailyBudget,
        status,
      });

      if (result !== false && !isEdit) {
        setName("");
        setObjective(defaultObjective);
        setDailyBudget(defaultBudget);
        setStatus(defaultStatus);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-muted border border-border rounded-none p-3.5 space-y-2.5 animate-in fade-in duration-150"
    >
      <div className="flex items-center justify-between border-b border-border pb-1.5">
        <span className="text-sm font-semibold text-foreground">
          {isEdit
            ? `Edit Campaign${initialData?.name ? ` : ${initialData.name}` : ""}`
            : "Create New Meta Campaign (Direct on Facebook)"}
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

      <div>
        <label className="text-xs font-medium text-foreground block mb-1">
          Campaign Name
        </label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Festive Silk Sarees - Direct Sales"
          className="w-full bg-card border border-border rounded-none px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-input focus:ring-2 focus:ring-ring/10"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-foreground">
              Objective
            </label>
          </div>
          <div className="relative">
            <select
              disabled={isEdit}
              value={objective}
              title={
                isEdit
                  ? "Objective cannot be changed after campaign creation on Meta"
                  : undefined
              }
              onChange={(e) => setObjective(e.target.value)}
              className={`w-full bg-card border border-border rounded-none pl-2.5 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:border-input appearance-none ${
                isEdit
                  ? "opacity-60 cursor-not-allowed bg-secondary text-muted-foreground"
                  : "cursor-pointer"
              }`}
            >
              <option value="OUTCOME_TRAFFIC">Traffic (Clicks)</option>
              <option value="OUTCOME_SALES">Sales (Conversions)</option>
              <option value="OUTCOME_LEADS">Leads (Inquiries)</option>
              <option value="OUTCOME_AWARENESS">Awareness (Reach)</option>
              <option value="OUTCOME_ENGAGEMENT">Engagement (Videos)</option>
              <option value="OUTCOME_APP_PROMOTION">
                App Promotion (Installs)
              </option>
              {![
                "OUTCOME_TRAFFIC",
                "OUTCOME_SALES",
                "OUTCOME_LEADS",
                "OUTCOME_AWARENESS",
                "OUTCOME_ENGAGEMENT",
                "OUTCOME_APP_PROMOTION",
              ].includes(objective) && (
                <option value={objective}>
                  {objective.replace("OUTCOME_", "")}
                </option>
              )}
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
      </div>

      {initialData?.status === "DELETED" && (
        <div className="p-2 bg-destructive-tint border border-destructive/25 text-destructive rounded-none text-xs">
          This campaign is deleted on Meta. Deleted campaigns are permanently locked and cannot be edited or reactivated.
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-border">
        <div>
          {isEdit &&
            onDelete &&
            (initialData?.status === "DELETED" ? (
              <span className="text-xs font-semibold text-destructive bg-destructive-tint px-2 py-0.5 rounded-none border border-destructive/25">
                Deleted on Meta
              </span>
            ) : (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting || isSubmitting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-destructive hover:text-destructive bg-card hover:bg-destructive-tint border border-destructive/25 hover:border-destructive/25 rounded-none transition-colors cursor-pointer"
                title="Delete Campaign"
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
              initialData?.status === "DELETED"
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
                  ? "Launch Live Campaign"
                  : "Draft Campaign"}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
