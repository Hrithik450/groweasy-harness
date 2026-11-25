import type { SessionSlug } from "@/lib/db";

/** Icon key resolved by the empty-state component. */
export type SuggestionIcon =
  | "compass"
  | "palette"
  | "sparkles"
  | "clock"
  | "search"
  | "target"
  | "trending"
  | "video"
  | "lightbulb";

export interface SessionSuggestion {
  icon: SuggestionIcon;
  title: string;
  prompt: string;
}

/** Empty-state cards, one set per bar. */
export const SESSION_SUGGESTIONS: Record<
  SessionSlug,
  readonly SessionSuggestion[]
> = {
  adManager: [
    {
      icon: "trending",
      title: "Audit my ad account",
      prompt:
        "Audit my connected Meta campaigns and tell me what to fix first, with the money impact.",
    },
    {
      icon: "search",
      title: "Competitor ad teardown",
      prompt:
        "Break down my competitors' winning ads and what we should remake for our brand.",
    },
    {
      icon: "sparkles",
      title: "Rebalance budgets",
      prompt:
        "Shift budget from the losing ads to the winners and explain the expected impact.",
    },
    {
      icon: "clock",
      title: "Schedule a daily health scan",
      prompt: "Set up a daily automated account health scan at 9:00 AM.",
    },
  ],
  adCreator: [
    {
      icon: "palette",
      title: "Create a static ad",
      prompt: "Create a high-converting static ad for our product.",
    },
    {
      icon: "video",
      title: "Turn an image into video",
      prompt: "Turn our product image into a fast-cut video ad.",
    },
    {
      icon: "lightbulb",
      title: "Fresh ad ideas",
      prompt:
        "Give me new ad ideas based on the winning concepts our competitors run.",
    },
    {
      icon: "sparkles",
      title: "UGC-style variant",
      prompt: "Create a UGC-style variant of our best performing creative.",
    },
  ],
  adStrategist: [
    {
      icon: "compass",
      title: "Competitor research & strategy",
      prompt:
        "Analyze the top competitors in our niche and suggest our winning ad strategy.",
    },
    {
      icon: "sparkles",
      title: "Campaign brief & target audiences",
      prompt:
        "Generate a targeted campaign brief with high-converting Facebook audience segments.",
    },
    {
      icon: "trending",
      title: "Today's performance report",
      prompt:
        "Write today's performance report with the top three moves we should make.",
    },
  ],
  businessProfile: [
    {
      icon: "search",
      title: "Refresh the brand profile",
      prompt:
        "Re-analyze our website and refresh the Brand Brain profile with what changed.",
    },
    {
      icon: "compass",
      title: "Find new competitors",
      prompt: "Find new direct competitors and add them to our profile.",
    },
    {
      icon: "target",
      title: "Sharpen our keywords",
      prompt:
        "Suggest better broad and product/service keywords for our brand.",
    },
    {
      icon: "palette",
      title: "Review brand voice",
      prompt: "Review our brand voice and suggest concrete improvements.",
    },
  ],
};

/** Composer chips next to the input, one set per bar. */
export const SESSION_CHIPS: Record<SessionSlug, readonly string[]> = {
  adManager: [
    "Create new campaign",
    "Optimize campaigns",
    "Rebalance budgets",
    "Audit my ad account",
  ],
  adCreator: ["New static ad", "Image to video", "Ad ideas", "UGC variant"],
  adStrategist: [
    "Campaign brief",
    "Find audiences",
    "Competitor research",
    "Daily report",
  ],
  businessProfile: [
    "Refresh profile",
    "Find competitors",
    "Keywords",
    "Brand voice",
  ],
};

/** Composer placeholder, one per bar. Short enough to stay on one line. */
export const SESSION_PLACEHOLDERS: Record<SessionSlug, string> = {
  adManager: "Ask anything about campaigns, budgets, or account health.",
  adCreator: "Ask anything about creatives, hooks, or video ads.",
  adStrategist: "Ask anything about strategy, competitors, or campaigns.",
  businessProfile: "Ask anything about your brand, competitors, or keywords.",
};

function slugKey(slug?: string | null): SessionSlug {
  return slug && slug in SESSION_SUGGESTIONS
    ? (slug as SessionSlug)
    : "adManager";
}

export function suggestionsFor(
  slug?: string | null,
): readonly SessionSuggestion[] {
  return SESSION_SUGGESTIONS[slugKey(slug)];
}

export function chipsFor(slug?: string | null): readonly string[] {
  return SESSION_CHIPS[slugKey(slug)];
}

export function placeholderFor(slug?: string | null): string {
  return SESSION_PLACEHOLDERS[slugKey(slug)];
}
