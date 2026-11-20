import { z } from "zod";
export * from "./constants";
import {
  MetaAdAccountStatus,
  MetaBuyingType,
  MetaCampaignObjective,
  MetaCampaignStatus,
  MetaSpecialAdCategory,
} from "./constants";

export const MetaAdCreativeSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  headline: z.string().optional(),
  primaryText: z.string().optional(),
  description: z.string().optional(),
  callToAction: z.string().optional(),
  destinationUrl: z.string().optional(),
  mediaUrl: z.string().optional(),
  pageId: z.string().optional(),
  imageHash: z.string().optional(),
  videoId: z.string().optional(),
});

export type MetaAdCreative = z.infer<typeof MetaAdCreativeSchema>;
export type MetaAdCreativeParams = MetaAdCreative;

export const MetaAdSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  creative: MetaAdCreativeSchema.optional(),
  adSetId: z.string().optional(),
  creativeId: z.string().optional(),
  createdTime: z.string().optional(),
  updatedTime: z.string().optional(),
});

export type MetaAd = z.infer<typeof MetaAdSchema>;

export const MetaCreativeParamsSchema = z.object({
  adAccountId: z.string(),
  /** Optional only when the account manages exactly one Page. */
  pageId: z.string().optional(),
  name: z.string(),
  type: z.enum(["image", "video"]),
  headline: z.string(),
  primaryText: z.string(),
  description: z.string().optional(),
  callToAction: z.string().optional(),
  destinationUrl: z.string(),
  imageHash: z.string().optional(),
  videoId: z.string().optional(),
});

export type MetaCreativeParams = z.infer<typeof MetaCreativeParamsSchema>;

export type MetaCreative = MetaCreativeParams & {
  pageId: string;
  creativeId: string;
  callToAction: string;
};

export const MetaAdParamsSchema = z.object({
  adAccountId: z.string(),
  adSetId: z.string(),
  name: z.string(),
  status: z.enum(["PAUSED", "ACTIVE"]).optional(),
  creativeId: z.string(),
});

export type MetaAdParams = z.infer<typeof MetaAdParamsSchema>;

export const MetaAdSetTargetingSchema = z.object({
  geoLocations: z
    .object({
      countries: z.array(z.string()).optional(),
      regions: z.array(z.object({ key: z.string() })).optional(),
      cities: z
        .array(
          z.object({
            key: z.string(),
            radius: z.number().optional(),
            distanceUnit: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  ageMin: z.number().optional(),
  ageMax: z.number().optional(),
  genders: z.array(z.number()).optional(), // 1: male, 2: female
  interests: z
    .union([
      z.array(z.object({ id: z.string(), name: z.string() })),
      z.array(z.string()),
    ])
    .optional(),
  behaviors: z
    .union([
      z.array(z.object({ id: z.string(), name: z.string() })),
      z.array(z.string()),
    ])
    .optional(),
  publisherPlatforms: z.array(z.string()).optional(),
  devicePlatforms: z.array(z.string()).optional(),
  languages: z.array(z.number()).optional(),
  locales: z.array(z.number()).optional(),
  customAudiences: z.array(z.object({ id: z.string() })).optional(),
  excludedCustomAudiences: z.array(z.object({ id: z.string() })).optional(),
});

export type MetaAdSetTargeting = z.infer<typeof MetaAdSetTargetingSchema>;

export const MetaAdSetSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED", "DELETED"]).optional(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
  budgetFormatted: z.string().optional(),
  billingEvent: z.string().optional(),
  optimizationGoal: z.string().optional(),
  bidAmount: z.number().optional(),
  bidStrategy: z.string().optional(),
  bidConstraints: z
    .object({ roasAverageFloor: z.number().optional() })
    .optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  targeting: MetaAdSetTargetingSchema.optional(),
  /** Conversion destination, e.g. WEBSITE. */
  destinationType: z.string().optional(),
  /** Destination object for the optimization goal. */
  promotedObject: z
    .object({
      pixelId: z.string().optional(),
      customEventType: z.string().optional(),
      applicationId: z.string().optional(),
      objectStoreUrl: z.string().optional(),
      productCatalogId: z.string().optional(),
      productSetId: z.string().optional(),
      pageId: z.string().optional(),
      leadFormId: z.string().optional(),
    })
    .optional(),
  frequencyControlSpecs: z.array(z.record(z.string(), z.unknown())).optional(),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  createdTime: z.string().optional(),
  updatedTime: z.string().optional(),
  ads: z.array(MetaAdSchema).optional(),
});

export type MetaAdSet = z.infer<typeof MetaAdSetSchema>;

export interface MetaAdSetParams extends MetaAdSet {
  campaignId: string;
  adAccountId: string;
}

export const MetaCampaignParamsSchema = z.object({
  name: z.string(),
  objective: z.nativeEnum(MetaCampaignObjective).or(z.string()),
  status: z.nativeEnum(MetaCampaignStatus).or(z.string()).optional(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
  startTime: z.string().optional(),
  stopTime: z.string().optional(),
  specialAdCategories: z
    .array(z.nativeEnum(MetaSpecialAdCategory).or(z.string()))
    .optional(),
  adAccountId: z.string().optional(),
  adSet: MetaAdSetSchema.optional(),
  creative: MetaAdCreativeSchema.optional(),
  adSets: z.array(MetaAdSetSchema).optional(),
  userId: z.string().optional(),
});

export type MetaCampaignParams = z.infer<typeof MetaCampaignParamsSchema>;

export const CreateMetaCampaignResultSchema = z.object({
  success: z.boolean(),
  id: z.string().optional(),
  name: z.string().optional(),
  status: z.nativeEnum(MetaCampaignStatus).or(z.string()).optional(),
  objective: z.nativeEnum(MetaCampaignObjective).or(z.string()).optional(),
  adAccountId: z.string().optional(),
  dailyBudget: z.number().optional(),
  dashboardUrl: z.string().optional(),
  adSetId: z.string().optional(),
  adSetName: z.string().optional(),
  creativeId: z.string().optional(),
  adId: z.string().optional(),
  imageHash: z.string().optional(),
  videoId: z.string().optional(),
  note: z.string().optional(),
  error: z.string().optional(),
});

export type CreateMetaCampaignResult = z.infer<
  typeof CreateMetaCampaignResultSchema
>;

export const MetaCampaignSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  objective: z.nativeEnum(MetaCampaignObjective),
  status: z.nativeEnum(MetaCampaignStatus).optional(),
  specialAdCategories: z.array(z.nativeEnum(MetaSpecialAdCategory)).optional(),
  dailyBudget: z.union([z.string(), z.number()]).optional(),
  lifetimeBudget: z.union([z.string(), z.number()]).optional(),
  budgetFormatted: z.string().optional(),
  createdTime: z.string().optional(),
  updatedTime: z.string().optional(),
  buyingType: z.nativeEnum(MetaBuyingType).optional(),
  adSets: z.array(MetaAdSetSchema).optional(),
});

export type MetaCampaign = z.infer<typeof MetaCampaignSchema>;

export const MetaAdAccountSchema = z.object({
  id: z.string(),
  /** Provider-facing account id (`act_…`); some surfaces read this, others read `id`. */
  accountId: z.string().optional(),
  name: z.string(),
  currency: z.string().default("USD"),
  timezoneName: z.string().default("UTC"),
  accountStatus: z
    .nativeEnum(MetaAdAccountStatus)
    .default(MetaAdAccountStatus.ACTIVE),
  amountSpent: z.string().optional(),
  balance: z.string().optional(),
  businessId: z.string().optional(),
  businessName: z.string().optional(),
  campaigns: z.array(MetaCampaignSchema).optional(),
});

export type MetaAdAccount = z.infer<typeof MetaAdAccountSchema>;

export const MetaConnectorSchema = z.object({
  error: z.string().optional(),
  adAccounts: z.array(MetaAdAccountSchema).default([]),
});

export type MetaConnector = z.infer<typeof MetaConnectorSchema>;

/**
 * Validates and formats metadata before inserting/upserting into database.
 */
export function validateMetaConnector(data: unknown): MetaConnector {
  return MetaConnectorSchema.parse(data);
}

/**
 * Safely parses and normalizes metadata when retrieving from database.
 */
export function parseMetaConnector(data: unknown): MetaConnector | null {
  if (!data || typeof data !== "object") return null;
  const result = MetaConnectorSchema.safeParse(data);
  return result.success ? result.data : null;
}

export const MetaValidationResultSchema = z.object({
  valid: z.boolean(),
  adAccounts: z.array(MetaAdAccountSchema).optional(),
  permissions: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export type MetaValidationResult = z.infer<typeof MetaValidationResultSchema>;
