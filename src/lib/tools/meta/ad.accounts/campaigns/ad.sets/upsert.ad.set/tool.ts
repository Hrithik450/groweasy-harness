import {
  createMetaAdSet,
  updateMetaAdSet,
  MetaAdSetStatus,
  MetaBidStrategy,
  MetaBillingEvent,
  MetaOptimizationGoal,
  type MetaAdSetParams,
} from "@/lib/connectors/meta.ads";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const upsertMetaAdSetToolDefinition = {
  type: "function" as const,
  name: "upsertMetaAdSet",
  description:
    "Create or update one Meta ad set. Include `id` to update it (name, status, budget, bid); omit `id` to create. Creation defaults to 'PAUSED'. Sales/leads campaigns need OFFSITE_CONVERSIONS or VALUE with promotedObject (pixelId + customEventType). Omit dailyBudget when the campaign already has a budget. If the campaign uses LOWEST_COST_WITH_BID_CAP, provide bidAmount.",
  parameters: {
    type: "object",
    properties: {
      adSet: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Meta ad set id; present means update.",
          },
          adAccountId: {
            type: "string",
            description:
              'Meta ad account id. Get it from `fetchMetaAdAccounts` (me/adaccounts). (e.g.: "act_123456789"). Required when creating.',
          },
          campaignId: {
            type: "string",
            description:
              'Parent campaign id. Get it from `fetchMetaCampaigns`. (e.g.: "120247784824320741"). Required when creating.',
          },
          name: {
            type: "string",
            description:
              'Ad set name, 3-8 words. (e.g.: "Diwali — Broad 18-45").',
          },
          status: {
            type: "string",
            enum: [MetaAdSetStatus.PAUSED, MetaAdSetStatus.ACTIVE],
            description:
              'Creation defaults to PAUSED. Use "ACTIVE" only when asked to publish.',
          },
          dailyBudget: {
            type: "number",
            description:
              "Daily budget in account currency major units. (e.g.: 400).",
          },
          optimizationGoal: {
            type: "string",
            enum: Object.values(MetaOptimizationGoal),
            description: 'Meta optimization goal. (e.g.: "LINK_CLICKS").',
          },
          billingEvent: {
            type: "string",
            enum: Object.values(MetaBillingEvent),
            description:
              'Meta billing event. (e.g.: "IMPRESSIONS" or "LINK_CLICKS").',
          },
          bidAmount: {
            type: "number",
            description:
              "Bid cap in account currency major units; only for bid-capped goals. (e.g.: 2).",
          },
          lifetimeBudget: {
            type: "number",
            description:
              "Lifetime budget in major units; needs startTime and endTime. Use instead of dailyBudget. (e.g.: 15000).",
          },
          startTime: {
            type: "string",
            description:
              'Ad set start, ISO-8601. (e.g.: "2026-12-01T00:00:00+0530").',
          },
          endTime: {
            type: "string",
            description:
              'Ad set end, ISO-8601; required with lifetimeBudget. (e.g.: "2026-12-20T23:59:59+0530").',
          },
          bidStrategy: {
            type: "string",
            enum: Object.values(MetaBidStrategy),
            description:
              "Meta bid strategy. Use MINIMUM_ROAS with bidConstraints. Docs: https://developers.facebook.com/docs/marketing-api/bidding/overview.",
          },
          bidConstraints: {
            type: "object",
            description:
              "Only with MINIMUM_ROAS. Docs: https://developers.facebook.com/docs/marketing-api/bidding/overview.",
            properties: {
              roasAverageFloor: {
                type: "number",
                description:
                  "Minimum ROAS as a decimal multiple. (e.g.: 1.5 for 1.5x).",
              },
            },
            additionalProperties: false,
          },
          frequencyControlSpecs: {
            type: "array",
            description:
              'Frequency caps for reach/frequency goals. (e.g.: [{"event":"IMPRESSIONS","interval_days":7,"max_frequency":2}]). Docs: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign.',
            items: { type: "object", additionalProperties: true },
          },
          targeting: {
            type: "object",
            description:
              'Meta targeting; additional Meta targeting keys are allowed. Shape: https://developers.facebook.com/docs/marketing-api/audiences/reference/basic-targeting. If a value needs a Meta key, use `queryMeta` with the targeting search queries documented at https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search. (e.g.: {"geoLocations":{"countries":["IN"]},"ageMin":18,"ageMax":45,"genders":[1,2],"interests":["Shoes"]}).',
            properties: {
              geoLocations: {
                type: "object",
                description:
                  'Where the ad may deliver. Use `countries`, or `regions`/`cities` with Meta keys. Get keys via `queryMeta`: search?type=adgeolocation&q=Delhi&location_types=["city","region"]&country_code=IN (docs: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search). (e.g.: {"countries":["IN"]}).',
                properties: {
                  countries: {
                    type: "array",
                    description: 'ISO country codes. (e.g.: ["IN", "US"]).',
                    items: { type: "string" },
                  },
                  regions: {
                    type: "array",
                    description:
                      'Meta region keys. Resolve with `queryMeta`: search?type=adgeolocation&q=Delhi&location_types=["region"]&country_code=IN (docs: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search). (e.g.: [{"key":"3843"}]).',
                    items: {
                      type: "object",
                      properties: {
                        key: {
                          type: "string",
                          description: "Meta region key.",
                        },
                      },
                      required: ["key"],
                      additionalProperties: false,
                    },
                  },
                  cities: {
                    type: "array",
                    description:
                      'Meta city keys with optional radius. Resolve with `queryMeta`: search?type=adgeolocation&q=Delhi&location_types=["city"]&country_code=IN (docs: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search). (e.g.: [{"key":"2430536","radius":25,"distanceUnit":"kilometer"}]).',
                    items: {
                      type: "object",
                      properties: {
                        key: {
                          type: "string",
                          description: "Meta city key.",
                        },
                        radius: {
                          type: "number",
                          description: "Radius around the city. (e.g.: 25).",
                        },
                        distanceUnit: {
                          type: "string",
                          description: 'Radius unit: "mile" or "kilometer".',
                        },
                      },
                      required: ["key"],
                      additionalProperties: false,
                    },
                  },
                },
                additionalProperties: false,
              },
              ageMin: {
                type: "number",
                description: "Minimum age, 13-65. (e.g.: 18).",
              },
              ageMax: {
                type: "number",
                description: "Maximum age, 13-65. (e.g.: 45).",
              },
              genders: {
                type: "array",
                description: "1 = male, 2 = female. (e.g.: [1, 2]).",
                items: { type: "number" },
              },
              interests: {
                type: "array",
                description:
                  'Interest names or ids. Resolve with `queryMeta`: search?type=adinterest&q=Shoes (docs: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search). (e.g.: ["Shoes", "Running"]).',
                items: { type: "string" },
              },
              behaviors: {
                type: "array",
                description:
                  'Behavior names or ids. Resolve with `queryMeta`: search?type=adTargetingCategory&class=behaviors&q=... (docs: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search). (e.g.: ["Frequent Travelers"]).',
                items: { type: "string" },
              },
              publisherPlatforms: {
                type: "array",
                description:
                  'Placements: "facebook", "instagram", "messenger", "audience_network". (e.g.: ["facebook","instagram"]).',
                items: { type: "string" },
              },
              devicePlatforms: {
                type: "array",
                description:
                  'Devices: "mobile", "desktop". (e.g.: ["mobile"]).',
                items: { type: "string" },
              },
              languages: {
                type: "array",
                description:
                  'Language keys. Resolve with `queryMeta`: search?type=adlocale&q=english. (e.g.: [6] for English).',
                items: { type: "number" },
              },
              locales: {
                type: "array",
                description:
                  'Locale keys. Resolve with `queryMeta`: search?type=adlocale&q=english. (e.g.: [6]).',
                items: { type: "number" },
              },
              customAudiences: {
                type: "array",
                description:
                  'Custom audience ids to include. Get them from `queryMeta`: act_<id>/customaudiences?fields=id,name. (e.g.: [{"id":"1234567890"}]).',
                items: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
              excludedCustomAudiences: {
                type: "array",
                description:
                  'Custom audience ids to exclude. Same source as `customAudiences`. (e.g.: [{"id":"1234567890"}]).',
                items: {
                  type: "object",
                  properties: { id: { type: "string" } },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: true,
          },
          destinationType: {
            type: "string",
            description:
              'Conversion destination for conversion goals. (e.g.: "WEBSITE", "APP", "MESSENGER"). Docs: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign.',
          },
          promotedObject: {
            type: "object",
            description:
              "Destination object for conversion, app, or catalog goals. Query pixels with `queryMeta`: act_<id>/adspixels?fields=id,name. Docs: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign.",
            properties: {
              pixelId: {
                type: "string",
                description:
                  'Meta pixel id. Get it from `queryMeta`: act_<id>/adspixels?fields=id,name. (e.g.: "1234567890").',
              },
              customEventType: {
                type: "string",
                description:
                  'Standard pixel event. (e.g.: "PURCHASE", "LEAD", "ADD_TO_CART"). Docs: https://developers.facebook.com/docs/marketing-api/reference/ad-campaign.',
              },
              applicationId: {
                type: "string",
                description:
                  'Meta App id for APP_INSTALLS. Get it from the Meta App Dashboard (App settings → Basic). Docs: https://developers.facebook.com/docs/apps.',
              },
              objectStoreUrl: {
                type: "string",
                description:
                  'App store URL. (e.g.: "https://apps.apple.com/app/id123").',
              },
              productCatalogId: {
                type: "string",
                description:
                  'Catalog id for catalog sales. Get it from `queryMeta`: act_<id>/product_catalogs?fields=id,name. (e.g.: "9876543210987").',
              },
              productSetId: {
                type: "string",
                description:
                  'Product set id. Get it from `queryMeta`: <catalog_id>/product_sets?fields=id,name. (e.g.: "1234567890").',
              },
              pageId: {
                type: "string",
                description:
                  'Facebook Page id for lead/engagement destinations. Get it from `fetchMetaPages` (me/accounts). (e.g.: "1029384756").',
              },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
    },
    required: ["adSet"],
  },
};

export type AdSetConfig = Omit<
  MetaAdSetParams,
  "adAccountId" | "campaignId"
> & {
  id?: string;
  adAccountId?: string;
  campaignId?: string;
  name: string;
};

export interface UpsertMetaAdSetArgs {
  adSet?: AdSetConfig;
}

export async function executeUpsertMetaAdSetTool(
  input: ToolInput<UpsertMetaAdSetArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) return failure("User authentication context required.");

  const cfg = input.args?.adSet;
  if (!cfg) return failure("The 'adSet' object is required.");
  if (!cfg.name) return failure("Ad set name is required.");

  try {
    if (cfg.id) {
      const res = await updateMetaAdSet({
        params: {
          adSetId: cfg.id,
          ...(cfg.name ? { name: cfg.name } : {}),
          ...(cfg.status ? { status: cfg.status } : {}),
          ...(cfg.dailyBudget !== undefined
            ? { dailyBudget: cfg.dailyBudget }
            : {}),
          ...(cfg.bidAmount !== undefined ? { bidAmount: cfg.bidAmount } : {}),
        },
        context: { userId, providerSlug: "meta" },
      });

      if (!res.success) {
        return failure(res.error?.message || "Failed to update ad set.");
      }

      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `Ad set **${cfg.name || res.data?.name || cfg.id}** (\`${cfg.id}\`) saved.${cfg.status ? ` | Status: ${cfg.status}` : ""}`,
            },
          ],
        },
      };
    }

    if (!cfg.adAccountId || !cfg.campaignId) {
      return failure("Create needs adAccountId and campaignId.");
    }

    const res = await createMetaAdSet({
      params: {
        name: cfg.name,
        campaignId: cfg.campaignId,
        adAccountId: cfg.adAccountId,
        status: cfg.status || "PAUSED",
        dailyBudget: cfg.dailyBudget,
        lifetimeBudget: cfg.lifetimeBudget,
        startTime: cfg.startTime,
        endTime: cfg.endTime,
        optimizationGoal: cfg.optimizationGoal,
        billingEvent: cfg.billingEvent,
        bidStrategy: cfg.bidStrategy,
        bidAmount: cfg.bidAmount,
        bidConstraints: cfg.bidConstraints,
        frequencyControlSpecs: cfg.frequencyControlSpecs,
        targeting: cfg.targeting,
        destinationType: cfg.destinationType,
        promotedObject: cfg.promotedObject,
      },
      context: { userId, providerSlug: "meta" },
    });

    if (!res.success || !res.data) {
      return failure(res.error?.message || "Failed to create ad set.");
    }

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Ad set **${cfg.name}** (\`${res.data.id}\`) saved under campaign \`${cfg.campaignId}\`.`,
          },
        ],
      },
    };
  } catch (err: unknown) {
    return failure(
      err instanceof Error ? err.message : "Ad set upsert failed.",
    );
  }
}
