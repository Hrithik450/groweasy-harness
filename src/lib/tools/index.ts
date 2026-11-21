import { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  generateImagesToolDefinition,
  GenerateImagesArgs,
  executeGenerateImagesTool,
  readImagesToolDefinition,
  ReadImagesArgs,
  executeReadImagesTool,
  fetchImageTypesToolDefinition,
  FetchImageTypesArgs,
  executeFetchImageTypesTool,
} from "./image";
import {
  syncLipsToolDefinition,
  SyncLipsArgs,
  executeSyncLipsTool,
  createSubtitlesToolDefinition,
  CreateSubtitlesArgs,
  executeCreateSubtitlesTool,
  readVideosToolDefinition,
  ReadVideosArgs,
  executeReadVideosTool,
  generateVideoToolDefinition,
  GenerateVideoArgs,
  executeGenerateVideoTool,
} from "./video";
import {
  convertAccentToolDefinition,
  ConvertAccentArgs,
  executeConvertAccentTool,
  dubAudioToolDefinition,
  DubAudioArgs,
  executeDubAudioTool,
  listVoiceCatalogToolDefinition,
  ListVoiceCatalogArgs,
  executeListVoiceCatalogTool,
  generateAudioToolDefinition,
  GenerateAudioArgs,
  executeGenerateAudioTool,
} from "./audio";
import {
  ffmpegToolDefinition,
  FfmpegArgs,
  executeFfmpegTool,
  renderElementToolDefinition,
  RenderElementArgs,
  executeRenderElementTool,
  fetchOverlayTypesToolDefinition,
  FetchOverlayTypesArgs,
  executeFetchOverlayTypesTool,
} from "./composition";
import {
  fetchMetaAdAccountsToolDefinition,
  FetchMetaAdAccountsArgs,
  executeFetchMetaAdAccountsTool,
  fetchMetaCampaignsToolDefinition,
  FetchMetaCampaignsArgs,
  executeFetchMetaCampaignsTool,
  fetchMetaAdSetsToolDefinition,
  FetchMetaAdSetsArgs,
  executeFetchMetaAdSetsTool,
  fetchMetaAdsToolDefinition,
  FetchMetaAdsArgs,
  executeFetchMetaAdsTool,
  fetchMetaPagesToolDefinition,
  FetchMetaPagesArgs,
  executeFetchMetaPagesTool,
  uploadMetaAssetToolDefinition,
  UploadMetaAssetArgs,
  executeUploadMetaAssetTool,
  upsertMetaCampaignToolDefinition,
  UpsertMetaCampaignArgs,
  executeUpsertMetaCampaignTool,
  upsertMetaAdSetToolDefinition,
  UpsertMetaAdSetArgs,
  executeUpsertMetaAdSetTool,
  upsertMetaAdToolDefinition,
  UpsertMetaAdArgs,
  executeUpsertMetaAdTool,
  createMetaCreativeToolDefinition,
  MetaCreativeParams,
  executeCreateMetaCreativeTool,
  fetchMetaCreativesToolDefinition,
  FetchMetaCreativesArgs,
  executeFetchMetaCreativesTool,
  queryMetaToolDefinition,
  QueryMetaArgs,
  executeQueryMetaTool,
  searchAdLibraryToolDefinition,
  SearchAdLibraryArgs,
  executeSearchAdLibraryTool,
} from "./meta";
import {
  updateBusinessProfileToolDefinition,
  UpdateBusinessProfileArgs,
  executeUpdateBusinessProfileTool,
  fetchBusinessProfileToolDefinition,
  FetchBusinessProfileArgs,
  executeFetchBusinessProfileTool,
} from "./business.profile";
import {
  scrapeWebPageToolDefinition,
  ScrapeWebPageArgs,
  executeScrapeWebPageTool,
} from "./web/scrape.page/tool";
import {
  updateAlertToolDefinition,
  UpdateAlertArgs,
  executeUpdateAlertTool,
  updateSuggestionsToolDefinition,
  UpdateSuggestionsArgs,
  executeUpdateSuggestionsTool,
  saveCompetitorResearchToolDefinition,
  SaveCompetitorResearchArgs,
  executeSaveCompetitorResearchTool,
  upsertAdsClassifiedToolDefinition,
  executeUpsertAdsClassifiedTool,
  updateIdeasToolDefinition,
  UpdateIdeasArgs,
  executeUpdateIdeasTool,
  updateCreativesToolDefinition,
  UpdateCreativesArgs,
  executeUpdateCreativesTool,
  updateDailyReportToolDefinition,
  UpdateDailyReportArgs,
  executeUpdateDailyReportTool,
  updateCampaignBriefsToolDefinition,
  UpdateCampaignBriefsArgs,
  executeUpdateCampaignBriefsTool,
} from "./detail.bar";
import {
  fetchDetailBarToolDefinition,
  FetchDetailBarArgs,
  executeFetchDetailBarTool,
} from "./detail.bar/fetch.projections/tool";
import {
  skillToolDefinition,
  executeSkillTool,
} from "@/lib/skills/tool";
import {
  renderUIBlockToolDefinition,
  executeRenderUIBlockTool,
  type RenderUIBlockArgs,
} from "./generative.ui/render.ui.block/tool";
import type { ModelToolSchema } from "@/lib/llm/llm/driver";
import {
  webSearchToolDefinition,
  executeWebSearchTool,
  type WebSearchCrawlArgs,
} from "./web/search/tool";
import {
  fetchShopifyCollectionsToolDefinition,
  executeFetchShopifyCollectionsTool,
  type FetchShopifyCollectionsArgs,
} from "./shopify/collections/tool";
import {
  fetchShopifyProductsToolDefinition,
  executeFetchShopifyProductsTool,
  type FetchShopifyProductsArgs,
} from "./shopify/products/tool";

export * from "./audio";
export * from "./image";
export * from "./video";
export * from "./composition";
export * from "./meta";
export * from "./business.profile";
export * from "./detail.bar";
export * from "./web/search/tool";
export * from "./web/scrape.page/tool";

export interface ToolDefinition {
  name: string;
  description: string;
  preSkills?: string | string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters?: Record<string, any>;
}

/** Result envelope guaranteed by the dispatcher. */
type ToolExecutionResult = ToolOutput<{
  contentParts: Array<InputContentParam>;
}>;

/**
 * Legacy executors share the `ToolOutput` envelope, but a few still recover to
 * plain data or no result while their barrels are being restored.
 */
type ToolExecutorResult = ToolOutput<unknown> | void;

export const TOOL_REGISTRY: Record<
  string,
  {
    definition: ToolDefinition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute?: (input: ToolInput<any>) => Promise<ToolExecutorResult>;
  }
> = {
  generateImages: {
    definition: generateImagesToolDefinition,
    execute: (input) =>
      executeGenerateImagesTool(input as ToolInput<GenerateImagesArgs>),
  },
  readImages: {
    definition: readImagesToolDefinition,
    execute: (input) =>
      executeReadImagesTool(input as ToolInput<ReadImagesArgs>),
  },
  fetchImageTypes: {
    definition: fetchImageTypesToolDefinition,
    execute: (input) =>
      executeFetchImageTypesTool(input as ToolInput<FetchImageTypesArgs>),
  },
  generateVideo: {
    definition: generateVideoToolDefinition,
    execute: (input) =>
      executeGenerateVideoTool(input as ToolInput<GenerateVideoArgs>),
  },
  listVoiceCatalog: {
    definition: listVoiceCatalogToolDefinition,
    execute: (input) =>
      executeListVoiceCatalogTool(input as ToolInput<ListVoiceCatalogArgs>),
  },
  generateAudio: {
    definition: generateAudioToolDefinition,
    execute: (input) =>
      executeGenerateAudioTool(input as ToolInput<GenerateAudioArgs>),
  },
  convertAccent: {
    definition: convertAccentToolDefinition,
    execute: (input) =>
      executeConvertAccentTool(input as ToolInput<ConvertAccentArgs>),
  },
  dubAudio: {
    definition: dubAudioToolDefinition,
    execute: (input) => executeDubAudioTool(input as ToolInput<DubAudioArgs>),
  },
  syncLips: {
    definition: syncLipsToolDefinition,
    execute: async (input) => {
      try {
        return {
          success: true,
          data: await executeSyncLipsTool(input.args as SyncLipsArgs),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
  createSubtitles: {
    definition: createSubtitlesToolDefinition,
    execute: async (input) => {
      try {
        return {
          success: true,
          data: await executeCreateSubtitlesTool(
            input.args as CreateSubtitlesArgs,
          ),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },
  readVideos: {
    definition: readVideosToolDefinition,
    execute: (input) =>
      executeReadVideosTool(input as ToolInput<ReadVideosArgs>),
  },
  renderElement: {
    definition: renderElementToolDefinition,
    execute: (input) =>
      executeRenderElementTool(input as ToolInput<RenderElementArgs>),
  },
  fetchOverlayTypes: {
    definition: fetchOverlayTypesToolDefinition,
    execute: () => executeFetchOverlayTypesTool(),
  },
  ffmpeg: {
    definition: ffmpegToolDefinition,
    execute: (input) => executeFfmpegTool(input as ToolInput<FfmpegArgs>),
  },
  searchAdLibrary: {
    definition: searchAdLibraryToolDefinition,
    execute: (input) =>
      executeSearchAdLibraryTool(input as ToolInput<SearchAdLibraryArgs>),
  },
  fetchMetaAdAccounts: {
    definition: fetchMetaAdAccountsToolDefinition,
    execute: (input) =>
      executeFetchMetaAdAccountsTool(
        input as ToolInput<FetchMetaAdAccountsArgs>,
      ),
  },
  fetchMetaCampaigns: {
    definition: fetchMetaCampaignsToolDefinition,
    execute: (input) =>
      executeFetchMetaCampaignsTool(input as ToolInput<FetchMetaCampaignsArgs>),
  },
  fetchMetaAdSets: {
    definition: fetchMetaAdSetsToolDefinition,
    execute: (input) =>
      executeFetchMetaAdSetsTool(input as ToolInput<FetchMetaAdSetsArgs>),
  },
  fetchMetaAds: {
    definition: fetchMetaAdsToolDefinition,
    execute: (input) =>
      executeFetchMetaAdsTool(input as ToolInput<FetchMetaAdsArgs>),
  },
  fetchMetaPages: {
    definition: fetchMetaPagesToolDefinition,
    execute: (input) =>
      executeFetchMetaPagesTool(input as ToolInput<FetchMetaPagesArgs>),
  },
  uploadMetaAsset: {
    definition: uploadMetaAssetToolDefinition,
    execute: (input) =>
      executeUploadMetaAssetTool(input as ToolInput<UploadMetaAssetArgs>),
  },
  upsertMetaCampaign: {
    definition: upsertMetaCampaignToolDefinition,
    execute: (input) =>
      executeUpsertMetaCampaignTool(
        input as ToolInput<UpsertMetaCampaignArgs>,
      ),
  },
  upsertMetaAdSet: {
    definition: upsertMetaAdSetToolDefinition,
    execute: (input) =>
      executeUpsertMetaAdSetTool(input as ToolInput<UpsertMetaAdSetArgs>),
  },
  upsertMetaAd: {
    definition: upsertMetaAdToolDefinition,
    execute: (input) =>
      executeUpsertMetaAdTool(input as ToolInput<UpsertMetaAdArgs>),
  },
  createMetaCreative: {
    definition: createMetaCreativeToolDefinition,
    execute: (input) =>
      executeCreateMetaCreativeTool(
        input as ToolInput<MetaCreativeParams>,
      ),
  },
  fetchMetaCreatives: {
    definition: fetchMetaCreativesToolDefinition,
    execute: (input) =>
      executeFetchMetaCreativesTool(
        input as ToolInput<FetchMetaCreativesArgs>,
      ),
  },
  queryMeta: {
    definition: queryMetaToolDefinition,
    execute: (input) => executeQueryMetaTool(input as ToolInput<QueryMetaArgs>),
  },
  renderUIBlock: {
    definition: renderUIBlockToolDefinition,
    execute: (input) =>
      executeRenderUIBlockTool(input as ToolInput<RenderUIBlockArgs>),
  },
  updateAlert: {
    definition: updateAlertToolDefinition,
    execute: (input) =>
      executeUpdateAlertTool(input as ToolInput<UpdateAlertArgs>),
  },
  // Plural alias: skills and prompts name the tab tool `updateAlerts`.
  updateAlerts: {
    definition: updateAlertToolDefinition,
    execute: (input) =>
      executeUpdateAlertTool(input as ToolInput<UpdateAlertArgs>),
  },
  upsertAdsClassified: {
    definition: upsertAdsClassifiedToolDefinition,
    execute: (input) => executeUpsertAdsClassifiedTool(input),
  },
  updateSuggestions: {
    definition: updateSuggestionsToolDefinition,
    execute: (input) =>
      executeUpdateSuggestionsTool(
        input as ToolInput<UpdateSuggestionsArgs>,
      ),
  },
  updateIdeas: {
    definition: updateIdeasToolDefinition,
    execute: (input) => executeUpdateIdeasTool(input as ToolInput<UpdateIdeasArgs>),
  },
  updateCreatives: {
    definition: updateCreativesToolDefinition,
    execute: (input) =>
      executeUpdateCreativesTool(input as ToolInput<UpdateCreativesArgs>),
  },
  updateDailyReport: {
    definition: updateDailyReportToolDefinition,
    execute: (input) =>
      executeUpdateDailyReportTool(input as ToolInput<UpdateDailyReportArgs>),
  },
  updateCampaignBriefs: {
    definition: updateCampaignBriefsToolDefinition,
    execute: (input) =>
      executeUpdateCampaignBriefsTool(input as ToolInput<UpdateCampaignBriefsArgs>),
  },
  fetchDetailBar: {
    definition: fetchDetailBarToolDefinition,
    execute: (input) =>
      executeFetchDetailBarTool(input as ToolInput<FetchDetailBarArgs>),
  },
  saveCompetitorResearch: {
    definition: saveCompetitorResearchToolDefinition,
    execute: (input) =>
      executeSaveCompetitorResearchTool(
        input as ToolInput<SaveCompetitorResearchArgs>,
      ),
  },
  scrapeWebPage: {
    definition: scrapeWebPageToolDefinition,
    execute: (input) =>
      executeScrapeWebPageTool(input as ToolInput<ScrapeWebPageArgs>),
  },
  webSearch: {
    definition: webSearchToolDefinition,
    execute: (input) =>
      executeWebSearchTool(input as ToolInput<WebSearchCrawlArgs>),
  },
  fetchShopifyProducts: {
    definition: fetchShopifyProductsToolDefinition,
    execute: (input) =>
      executeFetchShopifyProductsTool(
        input as ToolInput<FetchShopifyProductsArgs>,
      ),
  },
  fetchShopifyCollections: {
    definition: fetchShopifyCollectionsToolDefinition,
    execute: (input) =>
      executeFetchShopifyCollectionsTool(
        input as ToolInput<FetchShopifyCollectionsArgs>,
      ),
  },
  updateBusinessProfile: {
    definition: updateBusinessProfileToolDefinition,
    execute: (input) =>
      executeUpdateBusinessProfileTool(
        input as ToolInput<UpdateBusinessProfileArgs>,
      ),
  },
  fetchBusinessProfile: {
    definition: fetchBusinessProfileToolDefinition,
    execute: (input) =>
      executeFetchBusinessProfileTool(
        input as ToolInput<FetchBusinessProfileArgs>,
      ),
  },
  skill: {
    definition: skillToolDefinition,
    execute: (input) => executeSkillTool(input as ToolInput<{ name: string }>),
  },
};

/**
 * Every tool definition the loop may offer a session.
 *
 * The three marketing slugs share one backend agent — a customer asking the
 * strategist for an image, or the creator for a campaign audit, must not hit a
 * tool the other surface has — so they compose the whole catalog. The
 * registry's own dispatch guard is the authority: a definition a tool lacks is
 * impossible to offer, so this list and `TOOL_REGISTRY` cannot drift.
 */
export function getAllToolDefinitions(): readonly ModelToolSchema[] {
  return Object.values(TOOL_REGISTRY).map((entry) =>
    toModelSchema(entry.definition),
  );
}

/** Project one registry definition onto the driver's tool-schema shape. */
function toModelSchema(definition: ToolDefinition): ModelToolSchema {
  return {
    type: "function",
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters as Record<string, unknown>,
  };
}

/** Tool definitions for one session slug. */
export function getToolDefinitionsForSlug(
  slug?: string | null,
): readonly ModelToolSchema[] {
  if (slug === "businessProfile") {
    return [
      scrapeWebPageToolDefinition,
      webSearchToolDefinition,
      searchAdLibraryToolDefinition,
      fetchImageTypesToolDefinition,
      readImagesToolDefinition,
      readVideosToolDefinition,
      fetchBusinessProfileToolDefinition,
      updateBusinessProfileToolDefinition,
      fetchShopifyProductsToolDefinition,
      fetchShopifyCollectionsToolDefinition,
      skillToolDefinition,
    ].map(toModelSchema);
  }
  return getAllToolDefinitions();
}

/** Underscore tool names are aliases of their camelCase registration. */
function normalizeToolName(name: string): string {
  return name.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

/** What the dispatcher hands back: a tool result plus anything it deferred. */
export type ToolExecutionOutcome = ToolOutput<unknown> & {
  additionalContexts?: unknown[];
  concludesTurn?: boolean;
};

/**
 * Run one tool by name through the registry.
 *
 * This is the single entry point every caller uses — the loop's host adapter,
 * and anything server-side that invokes a tool directly. It never throws: a
 * missing tool, a missing executor, and a throwing body all become
 * `{ success: false, error }` so the caller has one shape to handle.
 */
export async function executeTool(
  name: string,
  input: ToolInput<Record<string, unknown>>,
): Promise<ToolExecutionOutcome> {
  console.log(
    `[Tool] Tool called: "${name}"`,
    input?.args ? JSON.stringify(input.args).slice(0, 160) : "",
  );

  const entry = TOOL_REGISTRY[name] ?? TOOL_REGISTRY[normalizeToolName(name)];
  if (!entry) {
    console.warn(`[Tool] Tool not found: "${name}"`);
    return {
      success: false,
      error: `Tool "${name}" is not registered in TOOL_REGISTRY.`,
    };
  }
  if (!entry.execute) {
    console.warn(`[Tool] Tool has no executor: "${name}"`);
    return { success: false, error: `Tool "${name}" has no executor.` };
  }

  try {
    const result = await entry.execute(input);
    return (result ?? { success: true }) as ToolExecutionOutcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Tool] "${name}" failed:`, message);
    return { success: false, error: message };
  }
}
