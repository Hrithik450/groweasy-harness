/**
 * Client-only, user-facing tool labels.
 *
 * The model and tool results keep their real names and errors; this file only
 * changes what the "Show process" panel renders.
 */

type ToolArgs = Record<string, unknown>;

/** ~5 varied status lines per tool; one is picked per tool-call occurrence. */
type ToolLabelVariants = readonly string[];
type ToolLabelFactory = (args: ToolArgs) => ToolLabelVariants;
type ToolLabelSpec = ToolLabelVariants | ToolLabelFactory;

const TOOL_LABELS: Record<string, ToolLabelSpec> = {
  generateImages: [
    "Generating ad images",
    "Creating the image concepts",
    "Rendering the ad visuals",
    "Producing the image set",
    "Building the creative images",
  ],
  readImages: [
    "Inspecting images",
    "Looking through the images",
    "Checking the visuals",
    "Reviewing image details",
    "Scanning the image assets",
  ],
  fetchImageTypes: [
    "Fetching image styles",
    "Loading image style options",
    "Gathering image layouts",
    "Checking available image styles",
    "Pulling up image templates",
  ],
  generateVideo: [
    "Generating video ad",
    "Rendering the video ad",
    "Creating the video cut",
    "Assembling the video ad",
    "Producing the video creative",
  ],
  readVideos: [
    "Analyzing video",
    "Inspecting the video",
    "Watching the creative",
    "Checking frames and pacing",
    "Reviewing the video ad",
  ],
  ffmpeg: [
    "Editing video or audio",
    "Cutting and stitching media",
    "Applying video edits",
    "Processing the media file",
    "Finishing the video edit",
  ],
  renderElement: [
    "Rendering visual asset",
    "Composing the visual",
    "Building the final visual",
    "Rendering the layout",
    "Producing the creative asset",
  ],
  fetchOverlayTypes: [
    "Fetching overlay layouts",
    "Loading overlay options",
    "Checking overlay templates",
    "Gathering layout choices",
    "Pulling up overlay styles",
  ],
  generateAudio: [
    "Generating voiceover",
    "Recording the voiceover",
    "Creating the audio track",
    "Producing the voice track",
    "Synthesizing the narration",
  ],
  listVoiceCatalog: [
    "Finding voice options",
    "Checking available voices",
    "Loading the voice catalog",
    "Browsing voice choices",
    "Gathering voice options",
  ],
  convertAccent: [
    "Converting voice accent",
    "Adjusting the voice accent",
    "Reworking the accent",
    "Matching the requested accent",
    "Tuning the voice accent",
  ],
  dubAudio: [
    "Dubbing audio",
    "Dubbing the voice track",
    "Laying in the dubbed audio",
    "Replacing the audio track",
    "Syncing the dubbed sound",
  ],
  syncLips: [
    "Syncing lip movement",
    "Matching lips to the audio",
    "Aligning lip movement",
    "Tightening lip sync",
    "Syncing the on-screen speech",
  ],
  createSubtitles: [
    "Creating subtitles",
    "Writing the subtitle track",
    "Adding captions",
    "Building the subtitle file",
    "Timing the captions",
  ],
  fetchBusinessProfile: [
    "Reading brand profile",
    "Loading the brand profile",
    "Checking brand details",
    "Reviewing the brand profile",
    "Pulling up brand settings",
  ],
  updateBusinessProfile: [
    "Updating brand profile",
    "Saving brand details",
    "Refreshing the brand profile",
    "Writing brand updates",
    "Applying brand profile changes",
  ],
  fetchShopifyProducts: [
    "Reading Shopify products",
    "Loading store products",
    "Checking product catalog",
    "Reviewing Shopify products",
    "Pulling up product details",
  ],
  fetchShopifyCollections: [
    "Reading Shopify collections",
    "Loading store collections",
    "Checking collection groups",
    "Reviewing Shopify collections",
    "Pulling up collection details",
  ],
  fetchMetaAdAccounts: [
    "Reading Meta ad accounts",
    "Loading ad accounts",
    "Checking connected ad accounts",
    "Reviewing Meta ad accounts",
    "Pulling up ad account details",
  ],
  fetchMetaCampaigns: [
    "Reading Meta campaigns",
    "Loading campaigns",
    "Checking active campaigns",
    "Reviewing Meta campaigns",
    "Pulling up campaign details",
  ],
  fetchMetaAdSets: [
    "Reading Meta ad sets",
    "Loading ad sets",
    "Checking ad set details",
    "Reviewing Meta ad sets",
    "Pulling up ad set details",
  ],
  fetchMetaAds: [
    "Reading Meta ads",
    "Loading ads",
    "Checking ad details",
    "Reviewing Meta ads",
    "Pulling up ad data",
  ],
  fetchMetaCreatives: [
    "Reading Meta creatives",
    "Loading creatives",
    "Checking creative details",
    "Reviewing Meta creatives",
    "Pulling up creative data",
  ],
  fetchMetaPages: [
    "Reading Meta pages",
    "Loading pages",
    "Checking page details",
    "Reviewing Meta pages",
    "Pulling up page info",
  ],
  queryMeta: [
    "Querying Meta insights",
    "Pulling Meta metrics",
    "Checking account insights",
    "Fetching Meta performance data",
    "Reading the latest metrics",
  ],
  createMetaCreative: [
    "Creating Meta creative",
    "Building the Meta creative",
    "Assembling the ad creative",
    "Setting up the Meta creative",
    "Preparing the creative",
  ],
  uploadMetaAsset: [
    "Uploading Meta asset",
    "Uploading the creative asset",
    "Sending the asset to Meta",
    "Pushing the file to Meta",
    "Uploading media to Meta",
  ],
  upsertMetaCampaign: [
    "Saving Meta campaign",
    "Writing campaign changes",
    "Updating the campaign",
    "Applying campaign settings",
    "Storing the campaign",
  ],
  upsertMetaAdSet: [
    "Saving Meta ad set",
    "Writing ad set changes",
    "Updating the ad set",
    "Applying ad set settings",
    "Storing the ad set",
  ],
  upsertMetaAd: [
    "Saving Meta ad",
    "Writing ad changes",
    "Updating the ad",
    "Applying ad settings",
    "Storing the ad",
  ],
  upsertAdsClassified: [
    "Saving ad classifications",
    "Recording the ad verdicts",
    "Writing the classification results",
    "Storing ad performance labels",
    "Updating the ad classifications",
  ],
  searchAdLibrary: (args) => {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) {
      return [
        "Searching Meta Ad Library",
        "Scanning competitor ads",
        "Checking live competitor ads",
        "Browsing the Ad Library",
        "Looking for ad examples",
      ];
    }
    return [
      `Searching Meta Ad Library for “${query}”`,
      `Looking for “${query}” in the Ad Library`,
      `Scanning competitor ads for “${query}”`,
      `Checking live ads for “${query}”`,
      `Pulling ad examples for “${query}”`,
    ];
  },
  webSearch: (args) => {
    if (typeof args.url === "string" && args.url.trim()) {
      return [
        "Reading page content",
        "Opening the page",
        "Scanning the web page",
        "Checking the page content",
        "Pulling page details",
      ];
    }
    return [
      "Searching the web",
      "Looking up current information",
      "Checking online sources",
      "Researching the web",
      "Gathering web results",
    ];
  },
  scrapeWebPage: [
    "Reading page content",
    "Opening the page",
    "Checking the site content",
    "Scanning the web page",
    "Pulling page details",
  ],
  fetchDetailBar: [
    "Reading saved workspace data",
    "Loading workspace details",
    "Checking saved data",
    "Reviewing workspace records",
    "Pulling up saved details",
  ],
  saveCompetitorResearch: [
    "Saving competitor research",
    "Writing competitor notes",
    "Storing the research",
    "Recording competitor findings",
    "Saving the research notes",
  ],
  updateAlert: [
    "Updating alert",
    "Saving the alert",
    "Refreshing the alert",
    "Writing the alert update",
    "Applying the alert change",
  ],
  updateAlerts: [
    "Updating alerts",
    "Saving the alerts",
    "Refreshing the alert list",
    "Writing alert updates",
    "Applying alert changes",
  ],
  updateSuggestions: [
    "Updating suggestions",
    "Saving suggestions",
    "Refreshing the suggestion list",
    "Writing suggestion updates",
    "Applying suggestion changes",
  ],
  updateIdeas: [
    "Saving ad ideas",
    "Writing the idea backlog",
    "Recording ad ideas",
    "Updating the idea list",
    "Storing the ideas",
  ],
  updateCreatives: [
    "Saving creatives",
    "Filing the finished assets",
    "Updating the creative list",
    "Recording the creatives",
    "Storing the creative assets",
  ],
  updateDailyReport: [
    "Saving daily report",
    "Writing the daily report",
    "Updating today's report",
    "Storing the daily summary",
    "Finalizing the report",
  ],
  updateCampaignBriefs: [
    "Saving campaign brief",
    "Writing the campaign brief",
    "Updating the brief",
    "Storing the campaign plan",
    "Finalizing the brief",
  ],
  renderUIBlock: [
    "Rendering result",
    "Building the response",
    "Rendering the view",
    "Preparing the result",
    "Composing the response",
  ],
  skill: (args) => {
    const raw = typeof args.name === "string" ? args.name : "";
    const skill = normalizeSkillName(raw);
    return SKILL_LABELS[skill] ?? GENERIC_SKILL_LABELS;
  },
};

/**
 * Friendly, non-leaky descriptions for known skills. Never render the raw
 * skill name: it exposes product internals in the process panel.
 */
const SKILL_LABELS: Record<string, ToolLabelVariants> = {
  "ads-classifier": [
    "Reading the ad classification guide",
    "Loading ad scoring guidance",
    "Reviewing how ads are classified",
    "Checking the classification rules",
    "Opening the ad classification guide",
  ],
  alerts: [
    "Reading the alert guide",
    "Loading account alert guidance",
    "Reviewing alert checks",
    "Checking the alert playbook",
    "Opening the alert guide",
  ],
  "business-profile": [
    "Reading the brand profile guide",
    "Loading brand setup guidance",
    "Reviewing brand profile instructions",
    "Checking the brand guide",
    "Opening the brand profile guide",
  ],
  "campaign-brief": [
    "Loading campaign planning guidance",
    "Reading the campaign brief guide",
    "Reviewing campaign planning steps",
    "Checking the brief guidance",
    "Opening campaign planning guidance",
  ],
  "campaign-health": [
    "Reading the campaign health guide",
    "Loading campaign health guidance",
    "Reviewing campaign health checks",
    "Checking the health playbook",
    "Opening the campaign health guide",
  ],
  "competitor-research": [
    "Reading relevant competitor research",
    "Loading competitor research guidance",
    "Reviewing competitor research notes",
    "Checking the research playbook",
    "Opening competitor research guidance",
  ],
  creatives: [
    "Reading the creative filing guide",
    "Loading creative guidance",
    "Reviewing how creatives are saved",
    "Checking the creative guide",
    "Opening creative guidance",
  ],
  "daily-report": [
    "Loading the reporting guide",
    "Reading the daily report guide",
    "Reviewing reporting steps",
    "Checking the report guidance",
    "Opening the reporting guide",
  ],
  ffmpeg: [
    "Reading the video editing guide",
    "Loading media editing guidance",
    "Reviewing editing steps",
    "Checking the editing playbook",
    "Opening video editing guidance",
  ],
  ideas: [
    "Loading idea-generation guidance",
    "Reading the idea guide",
    "Reviewing idea generation steps",
    "Checking the idea playbook",
    "Opening idea guidance",
  ],
  "static-ad": [
    "Reading the static ad guide",
    "Loading static ad guidance",
    "Reviewing static ad steps",
    "Checking the static ad playbook",
    "Opening static ad guidance",
  ],
  suggestions: [
    "Reading the suggestions guide",
    "Loading optimization guidance",
    "Reviewing suggestion steps",
    "Checking the optimization playbook",
    "Opening suggestion guidance",
  ],
  "video-ad": [
    "Reading the video ad guide",
    "Loading video ad guidance",
    "Reviewing video ad steps",
    "Checking the video ad playbook",
    "Opening video ad guidance",
  ],
  "video-service-config": [
    "Reading the video service guide",
    "Loading video service guidance",
    "Reviewing video service settings",
    "Checking the video service notes",
    "Opening video service guidance",
  ],
};

const GENERIC_SKILL_LABELS: ToolLabelVariants = [
  "Reading the relevant guidance",
  "Loading the relevant guidance",
  "Reviewing the guidance",
  "Checking the guidance",
  "Opening the guidance",
];

const USER_ERROR_MESSAGES: ToolLabelVariants = [
  "That step hit a snag — I’m on it.",
  "Something went wrong there — give me a moment.",
  "That one didn’t land — I’m looking into it.",
  "A hiccup on that step — I’ll sort it out.",
  "That didn’t go through — retrying shortly.",
];

/** One-line message shown for a tool/turn failure. */
export function userErrorMessage(): string {
  return pickVariant(USER_ERROR_MESSAGES);
}

function normalizeSkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-skill(s)?$/i, "");
}

/** Pick a stable variant for a known call id, else a random one. */
function pickVariant(variants: ToolLabelVariants, seed?: string): string {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return variants[(hash >>> 0) % variants.length];
  }
  return variants[Math.floor(Math.random() * variants.length)];
}

function humanizeToolName(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!spaced) return "Working on it";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Resolve a user-facing label for a tool call. */
export function toolLabel(name: string, args: ToolArgs, seed?: string): string {
  const spec = TOOL_LABELS[name];
  if (typeof spec === "function") return pickVariant(spec(args), seed);
  if (spec !== undefined) return pickVariant(spec, seed);
  return humanizeToolName(name);
}
