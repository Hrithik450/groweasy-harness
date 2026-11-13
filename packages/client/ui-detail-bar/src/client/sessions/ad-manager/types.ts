import type { MetaCampaignStatus } from "../../../constants";

export type AdManagerTabKey = "campaigns" | "alerts" | "suggestions";

export type AdManagerFilterStatus = "ALL" | "DRAFT" | MetaCampaignStatus;
