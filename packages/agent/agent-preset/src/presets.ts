/**
 * Agent presets: the session-scoped capabilities an agent is composed with.
 *
 * A preset is plain data — a name, the tools it may use, and the prompt/detail
 * bar surfaces it advertises. Workflows resolve a session slug to a preset and
 * expand the preset's tool names through the canonical registry. There is no
 * container and no per-agent framework: scope stays data.
 *
 * Tool names MUST match the registered definitions in the host's tool
 * registry; an unregistered name is reported loudly and skipped at resolution
 * time. The registry itself stays with the host, so this package never imports
 * an application alias or the product tool catalog.
 *
 * @module @openai-harness/agent-preset
 */

/** Session slug a preset serves, mirroring the host's session catalog. */
export type AgentPresetSlug =
  | "adManager"
  | "adCreator"
  | "adStrategist"
  | "businessProfile";

/** One agent composition. */
export interface AgentPreset {
  /** Stable preset name, conventionally the session slug it serves. */
  name: string;
  /** Human-readable summary used by logs and tooling. */
  description?: string;
  /** Registered tool names this preset composes. */
  tools: readonly string[];
  /** System-prompt section names this preset expects (data only, not compiled here). */
  promptSections?: readonly string[];
  /** Detail-bar registry key this preset pairs with. */
  detailBar?: string;
}

/** Every preset name, including the fallback. */
export type AgentPresetName = AgentPresetSlug | "default";

/**
 * Minimal lookup seam over a host tool registry.
 *
 * The canonical registry owns definitions and execution; presets only need to
 * turn a name into whatever definition the host composes.
 */
export interface ToolLookup<T> {
  get(name: string): T | undefined;
}

/** Prompt sections the main workflow's compiler emits. */
const HARNESS_SECTIONS = [
  "harness:identity",
  "harness:guardrails",
  "harness:golden-rules",
  "harness:rules",
  "harness:tips",
  "harness:ui-blocks",
  "harness:lego-components",
] as const;

/** Every tool registered in the host tool catalog, in registration order. */
const ALL_TOOL_NAMES: readonly string[] = [
  // Generative UI
  "renderUIBlock",
  // Image
  "generateImages",
  "readImages",
  "fetchImageTypes",
  // Video
  "imageToVideo",
  "syncLips",
  "createSubtitles",
  "readVideos",
  // Audio
  "convertAccent",
  "dubAudio",
  "listVoiceCatalog",
  "generateAudio",
  // Composition
  "ffmpeg",
  "renderElement",
  "fetchOverlayTypes",
  "saveAsset",
  // Meta
  "fetchMetaAdAccounts",
  "fetchMetaCampaigns",
  "fetchMetaAdSets",
  "fetchMetaAds",
  "createMetaCampaigns",
  "createMetaAd",
  "queryMetaGraphAPI",
  "searchAdLibrary",
  "validateMetaInterests",
  "saveCompetitorResearch",
  "fetchCompetitorResearches",
  // Account
  "updateAlerts",
  "updateSuggestions",
  "updateCampaigns",
  "saveReport",
  "saveCampaignBrief",
  "saveBusinessProfile",
  "fetchBusinessProfile",
  // Skills
  "skill",
  // Session
  "fetchSessionMessages",
  // Web
  "searchWeb",
  "scrapeWebPage",
  "alternateWebSearch",
  // Shopify
  "fetchShopifyProducts",
  "fetchShopifyCollections",
];

/**
 * Seed presets for every session slug, plus the fallback.
 *
 * The three marketing slugs — `adManager`, `adCreator`, `adStrategist` — are
 * separate *surfaces* of one backend agent, not separate capabilities: they
 * answer from the same conversation and may do anything the agent can do. A
 * customer asking the strategist for an image, or the creator for a campaign
 * audit, must not hit a tool the other surface has. So each of them composes
 * the whole catalog; only `businessProfile` (an internal build workflow rather
 * than a customer chat) stays deliberately narrow.
 */
export const agentPresets: Record<AgentPresetName, AgentPreset> = {
  adManager: {
    name: "adManager",
    description:
      "Runs ad accounts: audits delivery, manages campaigns/ad sets/ads, and surfaces alerts and suggestions.",
    tools: [...ALL_TOOL_NAMES],
    promptSections: HARNESS_SECTIONS,
    detailBar: "adManager",
  },

  adCreator: {
    name: "adCreator",
    description:
      "Produces ad creative: imagery, video, audio, and composed renders from brand and product context.",
    tools: [...ALL_TOOL_NAMES],
    promptSections: HARNESS_SECTIONS,
    detailBar: "adCreator",
  },

  adStrategist: {
    name: "adStrategist",
    description:
      "Researches markets, competitors, and winning ads, then turns findings into a strategy and publishes daily reports.",
    tools: [...ALL_TOOL_NAMES],
    promptSections: HARNESS_SECTIONS,
    detailBar: "adStrategist",
  },

  businessProfile: {
    name: "businessProfile",
    description:
      "Builds and refreshes the business profile from the brand website and connected catalog data.",
    tools: [
      "searchWeb",
      "scrapeWebPage",
      "alternateWebSearch",
      "skill",
      "searchAdLibrary",
      // The profile workflow displays ad-library media while researching, so
      // it can inspect what it displays.
      "readImages",
      "readVideos",
      "fetchImageTypes",
      "fetchBusinessProfile",
      "saveBusinessProfile",
      "fetchShopifyProducts",
      "fetchShopifyCollections",
    ],
    detailBar: "businessProfile",
  },

  default: {
    name: "default",
    description:
      "Fallback composition for sessions without a known slug; exposes the full tool registry.",
    tools: ALL_TOOL_NAMES,
    promptSections: HARNESS_SECTIONS,
    detailBar: "default",
  },
};

/**
 * Look up the preset for a session slug.
 * @param slug - a session slug, or null/undefined when the session has none.
 * @returns the preset, or undefined when the slug names no preset.
 */
export function getAgentPreset(
  slug: string | null | undefined,
): AgentPreset | undefined {
  if (!slug || !Object.hasOwn(agentPresets, slug)) return undefined;
  return agentPresets[slug as AgentPresetName];
}

/**
 * Resolve the preset for a session slug, falling back to `default`.
 * @param slug - a session slug, or null/undefined when the session has none.
 * @returns a preset; never undefined.
 */
export function resolveAgentPreset(
  slug: string | null | undefined,
): AgentPreset {
  return getAgentPreset(slug) ?? agentPresets.default;
}

/**
 * Expand a session slug's preset into live tool definitions. Unknown names are
 * ignored loudly — a preset naming a tool that is not registered is a
 * composition bug, not a reason to fail the whole turn.
 * @param slug - a session slug, or null/undefined when the session has none.
 * @param registry - host registry to resolve against.
 * @returns the tool definitions the preset composes, in preset order.
 */
export function resolvePresetTools<T>(
  slug: string | null | undefined,
  registry: ToolLookup<T>,
): T[] {
  const preset = resolveAgentPreset(slug);
  const resolved: T[] = [];
  const unknown: string[] = [];
  // One definition per name: a provider rejects a request carrying two tools
  // with the same name, and presets compose overlapping groups.
  const seen = new Set<string>();
  for (const name of preset.tools) {
    if (seen.has(name)) continue;
    const tool = registry.get(name);
    if (tool === undefined) {
      unknown.push(name);
      continue;
    }
    seen.add(name);
    resolved.push(tool);
  }
  if (unknown.length > 0) {
    console.warn(
      `[AgentPreset] "${preset.name}" references unregistered tool(s): ${unknown.join(", ")} — ignoring them`,
    );
  }
  return resolved;
}
