import type React from "react";
import type { SessionView } from "@openai-harness/session";
import type {
  MetaCampaignObjective,
  MetaCampaignStatus,
} from "./constants";

/** The folded `detailBar` projection handed to every bar and tab. */
export interface DetailBarValue<TData = unknown> {
  type: string;
  data: TData;
}

/**
 * Props every detail-bar session component receives. The registry passes the
 * session identity, the projected detail-bar value, and the host callbacks
 * through unchanged.
 */
export interface DetailBarComponentProps<TData = unknown> {
  /** Session identity (`id`, `slug`, `title`); never carries bar data. */
  session: SessionView;
  /** Whole-value `detailBar` projection folded from the committed log. */
  detailBar: DetailBarValue<TData>;
  isStreaming?: boolean;
  handleSubmit?: (
    content: string,
    options?: { isHidden?: boolean },
  ) => Promise<void> | void;
  handleUpdateData?: (newData: Partial<TData>) => Promise<void>;
  handleNavigation?: (messageId: string) => void;
}

export type DetailBarTabProps<TData = unknown> = DetailBarComponentProps<TData>;

export interface DetailBarTabConfig<TKey extends string = string> {
  id: TKey;
  label: string;
  badge?: number | string;
  badgeVariant?: "red" | "green" | "amber" | "neutral";
}

/**
 * Helper to dynamically extract the `data` prop type from any React detail bar component
 */
export type ExtractDetailBarData<T> = T extends (
  props: DetailBarComponentProps<infer D>,
) => any
  ? D
  : T extends React.ComponentType<DetailBarComponentProps<infer D>>
    ? D
    : unknown;

/**
 * Map of detail-bar data per registered type. The registry keys and this map
 * are kept in lockstep by `DetailBarRegistry` in `client/registry.ts`.
 */
export interface DetailBarDataMap {
  adManager: AdManagerDetailBarData;
  adCreator: AdCreatorDetailBarData;
  adStrategist: AdStrategistDetailBarData;
  businessProfile: DefaultDetailBarData;
  default: DefaultDetailBarData;
}

/** The component table shape the registry implements. */
export type DetailBarRegistry = Record<
  keyof DetailBarDataMap,
  React.ComponentType<DetailBarComponentProps<any>>
>;

export type DetailBarType = keyof DetailBarDataMap | (string & {});

export type CampaignAdClassification =
  | "winner"
  | "scaler"
  | "loser"
  | "potential"
  | "untested";

export interface CampaignAdAction {
  fix: string;
  before?: string;
  after?: string;
  moneyValue?: string;
}

export interface CampaignAdSecondaryAction {
  label: string;
  prompt?: string;
}

export interface CampaignAd {
  id: string;
  name: string;
  classification: CampaignAdClassification;
  format?: "video" | "static" | "carousel";
  daysActive?: number;
  impressions?: number;
  cpa?: string;
  roas?: string;
  siblingComparison?: string;
  resultShare?: string;
  hook?: string;
  whyItWorks?: string;
  action?: CampaignAdAction;
  /** Short "VID" / "IMG" label rendered inside the thumbnail tile. */
  thumbnailLabel?: string;
  /** Reference-style metric lines (comparison + context). */
  metricLines?: string[];
  /** One-line diagnosis shown beneath the metric lines. */
  insight?: string;
  /** Label for the primary action button (falls back to classification defaults). */
  actionLabel?: string;
  /** Optional secondary (outline) action. */
  secondaryAction?: CampaignAdSecondaryAction;
  /** Green savings / upside line shown next to the actions. */
  savings?: string;
  /** Force the primary action to take the full row width. */
  actionFullWidth?: boolean;
}

export interface AdManagerCampaignChips {
  winners?: number;
  scalers?: number;
  losers?: number;
  potential?: number;
}

/**
 * The Meta campaign fields the detail bar reads. This is the wire-safe subset
 * of the connector schema; the full Graph-API model stays in the application.
 */
export interface MetaCampaign {
  id?: string;
  name: string;
  objective: MetaCampaignObjective;
  status?: MetaCampaignStatus;
  specialAdCategories?: string[];
  dailyBudget?: string | number;
  lifetimeBudget?: string | number;
  budgetFormatted?: string;
  createdTime?: string;
  updatedTime?: string;
  buyingType?: string;
  adSets?: unknown[];
}

export interface AdManagerCampaign extends MetaCampaign {
  subtitle?: string;
  /** Draft campaigns render the red-tinted card with no performance metrics. */
  isDraft?: boolean;
  /** Optional display label for the status chip (e.g. "Draft"). */
  statusLabel?: string;
  /** Descriptive line shown on draft campaign cards. */
  descriptiveLine?: string;
  revenue?: string;
  spend?: string;
  purchases?: number | string;
  cpa?: string;
  roas?: string;
  leads?: number | string;
  cpl?: string;
  ctr?: string;
  cpm?: string;
  frequency?: string;
  clicks?: number | string;
  impressions?: number | string;
  chips?: AdManagerCampaignChips;
  ads?: CampaignAd[];
}

export type AdManagerAlertSeverity =
  | "critical"
  | "warning"
  | "good";
export type AdManagerAlertStatus = "pending" | "completed" | "error";

export interface AdManagerAlertMeta {
  adAccountId: string;
  campaignId: string;
  adSetId?: string;
  adId?: string;
}

export interface AdManagerAlertAction {
  fix: string;
  before?: string;
  after?: string;
}

export interface AdManagerAlert {
  id: string;
  title: string;
  description: string;
  severity: AdManagerAlertSeverity;
  status: AdManagerAlertStatus;
  meta: AdManagerAlertMeta;
  action: AdManagerAlertAction;
  chart?: Record<string, unknown>;
  timestamp: string;
}

export type AdManagerSuggestionIcon = "stop" | "shift" | "refresh" | "pause";

export interface AdManagerSuggestion {
  id: string;
  title: string;
  description: string;
  /** Green savings / upside line (e.g. "saves ≈ ₹4,700/week · Likely"). */
  savings?: string;
  icon?: AdManagerSuggestionIcon;
  actionLabel: string;
  /** Prompt dispatched through handleSubmit when the primary action is tapped. */
  prompt: string;
  status?: AdManagerAlertStatus;
}

export interface AdManagerDetailBarData {
  campaigns?: AdManagerCampaign[];
  alerts?: AdManagerAlert[];
  winningAds?: WinningAd[];
  suggestions?: AdManagerSuggestion[];
}

export type AdCreatorCategory = "FRESHNESS" | "TRADITION" | "PROOF" | string;

export interface AdCreatorIdea {
  id: string;
  category: AdCreatorCategory;
  title: string;
  description: string;
}

export interface AdCreatorCreative {
  id: string;
  title: string;
  type: "video" | "image";
  status: "Ready" | "Draft";
  aspectRatio: string;
  description: string;
  /** Placeholder artwork treatment (all resolved through theme tokens). */
  previewKind?: "ink" | "brand" | "accent" | "tan";
  /** Runtime label for video tiles (e.g. "0:24"). */
  duration?: string;
  /** Campaign the creative belongs to, shown in the live status line. */
  campaign?: string;
  /** Full status line override (e.g. "Live · Groundnut oil · Mysuru"). */
  statusLine?: string;
  isLive?: boolean;
}

export interface AdCreatorDetailBarData {
  ideas: AdCreatorIdea[];
  creatives: AdCreatorCreative[];
}

export interface AdStrategistReport {
  id: string;
  period: "thisWeek" | "lastWeek";
  day: string;
  date: string;
  /** Calendar day the report covers (`YYYY-MM-DD`). */
  isoDate: string;
  title: string;
  summary: string;
  /** One normalized json-render UI block spec (root `Stack`). */
  blocks: Record<string, unknown>;
  isNew?: boolean;
  /** Epoch milliseconds the report was written. */
  createdAt: number;
}

export interface WinningAdAction {
  label: string;
  prompt: string;
}

export interface WinningAd {
  id: string;
  brandName: string;
  brandLogo?: string;
  adUrl?: string;
  daysActive: number;
  startDate?: string;
  impressions?: number;
  versionCount?: number;
  format?: string;
  whyItWorks: string;
  remakeNotes?: string;
  structure: Record<string, unknown>;
  action?: WinningAdAction;
}

export interface CompetitorResearchItem {
  title: string;
  content: string;
  messageId: string;
  brandUrl?: string;
  newCompetitors: string[];
  newKeywords?: string[];
  newAds?: {
    staticAds?: string[];
    videoAds?: string[];
  };
  createdAt: string;
}

export interface AdStrategistDocument {
  id: string;
  title: string;
  /** Summary of the document, shown when a card is opened. */
  content?: string;
  kind: string;
  dateLabel: string;
  /** ISO timestamp; when present the tab renders the real date, not the label. */
  createdAt?: string;
  icon?: "brief" | "competitor" | "strategy" | "audience";
  messageId?: string;
  isActive?: boolean;
}

export interface AdStrategistDetailBarData {
  reports: AdStrategistReport[];
  competitorResearches?: CompetitorResearchItem[];
  documents?: AdStrategistDocument[];
}

export interface DefaultDetailBarData {
  notes?: string;
  quickStats?: Record<string, string | number>;
}
