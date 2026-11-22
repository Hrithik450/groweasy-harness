/**
 * Client-only, user-facing tool labels.
 *
 * The model and tool results keep their real names and errors; this map only
 * changes what the "Show process" panel renders.
 */

type ToolArgs = Record<string, unknown>;

type ToolLabel = string | ((args: ToolArgs) => string);

const TOOL_LABELS: Record<string, ToolLabel> = {
  generateImages: "Generating ad images",
  readImages: "Inspecting images",
  fetchImageTypes: "Fetching image styles",
  generateVideo: "Generating video ad",
  readVideos: "Analyzing video",
  ffmpeg: "Editing video or audio",
  renderElement: "Rendering visual asset",
  fetchOverlayTypes: "Fetching overlay layouts",
  generateAudio: "Generating voiceover",
  listVoiceCatalog: "Finding voice options",
  convertAccent: "Converting voice accent",
  dubAudio: "Dubbing audio",
  syncLips: "Syncing lip movement",
  createSubtitles: "Creating subtitles",
  fetchBusinessProfile: "Reading brand profile",
  updateBusinessProfile: "Updating brand profile",
  fetchShopifyProducts: "Reading Shopify products",
  fetchShopifyCollections: "Reading Shopify collections",
  fetchMetaAdAccounts: "Reading Meta ad accounts",
  fetchMetaCampaigns: "Reading Meta campaigns",
  fetchMetaAdSets: "Reading Meta ad sets",
  fetchMetaAds: "Reading Meta ads",
  fetchMetaCreatives: "Reading Meta creatives",
  fetchMetaPages: "Reading Meta pages",
  queryMeta: "Querying Meta insights",
  createMetaCreative: "Creating Meta creative",
  uploadMetaAsset: "Uploading Meta asset",
  upsertMetaCampaign: "Saving Meta campaign",
  upsertMetaAdSet: "Saving Meta ad set",
  upsertMetaAd: "Saving Meta ad",
  upsertAdsClassified: "Saving ad classifications",
  searchAdLibrary: (args) => {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    return query
      ? `Searching Meta Ad Library for “${query}”`
      : "Searching Meta Ad Library";
  },
  webSearch: (args) =>
    typeof args.url === "string" && args.url.trim()
      ? "Reading page content"
      : "Searching the web",
  scrapeWebPage: "Reading page content",
  fetchDetailBar: "Reading saved workspace data",
  saveCompetitorResearch: "Saving competitor research",
  updateAlert: "Updating alert",
  updateAlerts: "Updating alerts",
  updateSuggestions: "Updating suggestions",
  updateIdeas: "Saving ad ideas",
  updateCreatives: "Saving creatives",
  updateDailyReport: "Saving daily report",
  updateCampaignBriefs: "Saving campaign brief",
  renderUIBlock: "Rendering result",
  skill: (args) => {
    const name = typeof args.name === "string" ? args.name.trim() : "";
    return name ? `Loading ${name} skill` : "Loading marketing skill";
  },
};

/** One-line message shown for every tool/turn failure. */
export const USER_ERROR_MESSAGE = "That step hit a snag — I’m on it.";

function humanizeToolName(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return "Working on it";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Resolve a user-facing label for a tool call. */
export function toolLabel(name: string, args: ToolArgs): string {
  const label = TOOL_LABELS[name];
  if (typeof label === "function") return label(args);
  if (typeof label === "string") return label;
  return humanizeToolName(name);
}
