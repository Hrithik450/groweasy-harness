import type React from "react";
import type { DetailBarField, BarStatus } from "@/lib/detail.bar/fields";
import type {
  DetailBarRegistry,
  DetailBarComponentProps,
} from "@/components/detail.bar/registry";
export type { DetailBarRegistry, DetailBarComponentProps };
import type { MetaCampaign } from "@/lib/connectors/meta.ads/types";

/** Props one tab receives from its bar: the payload is already unwrapped. */
export interface DetailBarTabProps<TData = unknown> {
  session?: import("@/lib/core/session/view").SessionView;
  isStreaming?: boolean;
  handleSubmit?: (
    content: string,
    options?: { source?: import("@/lib/session/prompt").PromptSource },
  ) => Promise<void> | void;
  /**
   * Update the bar: always applies `newData` locally; when `item` is given the
   * row patch is also persisted and the server merges it.
   */
  handleUpdateData?: (item: {
    kind: DetailBarField;
    id: string;
    patch: Record<string, unknown>;
  }) => Promise<void>;
  handleNavigation?: (turnId: string) => void;
}

// DetailBar UI Tab Configuration
export interface DetailBarTabConfig<TKey extends string = string> {
  id: TKey;
  label: string;
  badge?: number | string;
  badgeVariant?: "red" | "green" | "amber" | "neutral";
}

/**
 * Data shape per specialised bar, derived from the component registry.
 *
 * `DETAIL_BAR_REGISTRY` is declared without a `ComponentType<any>` annotation,
 * so each component keeps its precise props and `infer` can read the data type.
 */
export type ExtractDetailBarData<T> =
  T extends React.ComponentType<DetailBarComponentProps<infer D>>
    ? [D] extends [never]
      ? never
      : D
    : never;

export type DetailBarDataMap = {
  [K in keyof DetailBarRegistry as K extends "default"
    ? never
    : ExtractDetailBarData<DetailBarRegistry[K]> extends never
      ? never
      : K]: ExtractDetailBarData<DetailBarRegistry[K]>;
};

/** Bars that render a specialised detail bar (derived from the registry map). */
export type DetailBarSlug = keyof DetailBarDataMap;

export type DetailBarType = DetailBarSlug | "default";

/** Card shape each tab stores. */
export interface DetailBarFieldItemMap {
  campaigns: Campaign;
  alerts: Alert;
  suggestions: Suggestion;
  ideas: Idea;
  creatives: Creative;
  reports: DailyReport;
  competitorResearches: CompetitorResearchItem;
  campaignBriefs: CampaignBrief;
}

export type DetailBarFieldItem<F extends keyof DetailBarFieldItemMap> =
  DetailBarFieldItemMap[F];

export interface BarRowRef {
  id: string;
  seq?: number;
  /** When the row was written, ISO 8601. Every date label derives from it. */
  createdAt?: string;
}

// 1. Ad Manager bar payload
/** Health counts the card derives from its ads, one chip per non-zero bucket. */
export interface CampaignChips {
  winners?: number;
  scalers?: number;
  losers?: number;
  potential?: number;
}

export const AD_CATEGORIES = [
  "winner",
  "scaler",
  "potential",
  "loser",
  "untested",
] as const;

export type AdCategory = (typeof AD_CATEGORIES)[number];

/** What the user did with the card's action; every action card carries one. */
export type ActionStatus = BarStatus;

/** Wire-only row state merged by `rowToItem`; never stored in `data`. */
export type BarCard<T> = T & { status?: BarStatus };

/** The numbers printed under an ad's name, all derived from Meta. */
export interface CampaignAdMetrics {
  daysActive?: number;
  impressions?: number | string;
  clicks?: number;
  ctr?: string;
  spend?: string;
  purchases?: number;
  frequency?: number | string;
  cpa?: string;
  roas?: string;
}

/** The move recommended for one ad; the user's decision lives on the row. */
export interface CampaignAdAction {
  /** Recommendation sentence, e.g. "Pause it and move ₹400/day to the winner." */
  fix: string;
  /** Preview drawer: what is true now. */
  before?: string;
  /** Preview drawer: what the move changes. */
  after?: string;
}

/** One ad; the campaign's inner panel groups these by category. */
export interface CampaignAd {
  id: string;
  name: string;
  /** Meta ad set the ad belongs to; classification compares within it. */
  adsetId?: string;
  category: AdCategory;
  format?: "video" | "image";
  /** The creative itself; the mini player opens the lightbox. */
  mediaUrl?: string;
  metrics?: CampaignAdMetrics;
  /** Metric against the other ads in its ad set, max 5-6 words. */
  siblingComparison?: string;
  /** This ad's share of results vs its ad set, campaign, or account. */
  resultShare?: string;
  /** Expected gain from taking the action, one string metric. */
  value?: string;
  /** One crisp line on why it works, max 10 words. */
  whyItWorks?: string;
  /** The one move the panel recommends, rendered like an alert's action. */
  action?: CampaignAdAction;
}

/** The numbers the card and panel print; every value is preformatted. */
export interface CampaignMetrics {
  spend?: string;
  purchases?: number | string;
  cpa?: string;
  roas?: string;
  cpl?: string;
  leads?: number | string;
}

/** A campaign card: the Meta record plus what the tab computes for it. */
export type Campaign = Omit<MetaCampaign, "status"> &
  BarRowRef & {
    /** Campaign state as the card reads it, e.g. Active, Paused, Draft. */
    metaStatus?: string;
    description?: string;
    metrics?: CampaignMetrics;
    ads?: CampaignAd[];
  };

export type AlertSeverity = "critical" | "warning";
export type AlertStatus = BarStatus;

export interface AlertMeta {
  adAccountId: string;
  campaignId: string;
  adSetId?: string;
  adId?: string;
}

export interface AlertAction {
  fix: string;
  before?: string;
  after?: string;
}

export interface Alert extends BarRowRef {
  title: string;
  severity: AlertSeverity;
  description: string;
  action: AlertAction;
  meta: AlertMeta;
  chart?: Record<string, unknown>;
  note?: string;
}

/** A suggestion is an opportunity to act on, not a condition to grade. */
export type Suggestion = Omit<Alert, "severity">;

export interface AdManagerDetailBarData {
  campaigns?: Campaign[];
  alerts?: Alert[];
  suggestions?: Suggestion[];
}

// 2. Ad Creator bar payload
export type AdCreatorCategory = "FRESHNESS" | "TRADITION" | "PROOF" | string;

export interface Idea extends BarRowRef {
  title: string;
  description: string;
  category: AdCreatorCategory;
  /** Where the idea came from: a competitor winner, our winner, an insight… */
  source?: string;
  /** What the idea is made of; picks the preview component. */
  format?: "video" | "image";
  /** Media the idea is modelled on (a competitor or our own ad). */
  mediaUrl?: string;
  sourceUrl?: string;
  aspectRatio?: string;
  /** One line: what we make, for whom. */
  why?: string;
  hook?: string;
  makeFor?: string;
  createdAt?: string;
}

export interface Creative extends BarRowRef {
  title: string;
  type: "video" | "image";
  /** Verified ratio, e.g. "9:16", "1:1", "16:9". */
  aspectRatio: string;
  /** What the asset shows. */
  description: string;
  /** The asset: an '/api/attachments/…' URL or an https URL. */
  mediaUrl: string;
  createdAt?: string;
}

export interface AdCreatorDetailBarData {
  ideas?: Idea[];
  creatives?: Creative[];
}

// 3. Ad Strategist bar payload
export interface DailyReport extends BarRowRef {
  title: string;
  summary: string;
  blocks?: Record<string, unknown>;
  createdAt?: string;
}

export interface CompetitorResearchItem extends BarRowRef {
  title: string;
  content: string;
  /** Assistant message that produced it. */
  turnId?: string;
  newCompetitors: string[];
  newKeywords?: string[];
  newAds?: {
    staticAds?: string[];
    videoAds?: string[];
  };
  createdAt: string;
}

export interface CampaignBrief extends BarRowRef {
  title: string;
  /** Two-line gist; the full brief is the message it points at. */
  summary?: string;
  /** Assistant message that produced it. */
  turnId?: string;
  sourceSessionId?: string;
}

export interface AdStrategistDetailBarData {
  reports?: DailyReport[];
  competitorResearches?: CompetitorResearchItem[];
  campaignBriefs?: CampaignBrief[];
}
