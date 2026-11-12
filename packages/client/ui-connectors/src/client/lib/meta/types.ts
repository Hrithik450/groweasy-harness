import { z } from "zod";
export * from "./constants";
import {
  MetaAdAccountStatus,
  MetaBuyingType,
  MetaCampaignObjective,
  MetaCampaignStatus,
  MetaSpecialAdCategory,
  MetaBillingEvent,
  MetaOptimizationGoal,
  MetaCallToActionType,
  MetaDistanceUnit,
  MetaGender,
} from "./constants";

export const MetaAdCreativeSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  headline: z.string().optional(),
  primaryText: z.string().optional(),
  description: z.string().optional(),
  callToAction: z.nativeEnum(MetaCallToActionType).or(z.string()).optional(),
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
  status: z.nativeEnum(MetaCampaignStatus).or(z.string()).optional(),
  effectiveStatus: z.string().optional(),
  adSetId: z.string().optional(),
  campaignId: z.string().optional(),
  creative: MetaAdCreativeSchema.optional(),
  createdTime: z.string().optional(),
  updatedTime: z.string().optional(),
});

export type MetaAd = z.infer<typeof MetaAdSchema>;

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
            distanceUnit: z
              .nativeEnum(MetaDistanceUnit)
              .or(z.string())
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  ageMin: z.number().optional(),
  ageMax: z.number().optional(),
  genders: z.array(z.nativeEnum(MetaGender).or(z.number())).optional(),
  interests: z
    .union([
      z.array(z.object({ id: z.string(), name: z.string() })),
      z.array(z.string()),
    ])
    .optional(),
});

export type MetaAdSetTargeting = z.infer<typeof MetaAdSetTargetingSchema>;

export const MetaAdSetSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  status: z.nativeEnum(MetaCampaignStatus).or(z.string()).optional(),
  dailyBudget: z.number().optional(),
  lifetimeBudget: z.number().optional(),
  budgetFormatted: z.string().optional(),
  billingEvent: z.nativeEnum(MetaBillingEvent).or(z.string()).optional(),
  optimizationGoal: z
    .nativeEnum(MetaOptimizationGoal)
    .or(z.string())
    .optional(),
  bidAmount: z.number().optional(),
  targeting: MetaAdSetTargetingSchema.optional(),
  ads: z.array(MetaAdSchema).optional(),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  createdTime: z.string().optional(),
});

export type MetaAdSet = z.infer<typeof MetaAdSetSchema>;
export type MetaAdSetParams = MetaAdSet;

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
export type CreateMetaCampaignResult = MetaCampaign;

export const CreateMetaCampaignParamsSchema = MetaCampaignSchema.omit({
  createdTime: true,
  updatedTime: true,
  budgetFormatted: true,
}).extend({
  objective: z.nativeEnum(MetaCampaignObjective).or(z.string()),
  status: z.nativeEnum(MetaCampaignStatus).or(z.string()).optional(),
  specialAdCategories: z
    .array(z.nativeEnum(MetaSpecialAdCategory).or(z.string()))
    .optional(),
  adAccountId: z.string(),
  adSet: MetaAdSetSchema.optional(),
  creative: MetaAdCreativeSchema.optional(),
});

export type CreateMetaCampaignParams = z.infer<
  typeof CreateMetaCampaignParamsSchema
>;

export const MetaAdAccountSchema = z.object({
  id: z.string(),
  accountId: z.string(),
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
  userId: z.string().optional(),
  userName: z.string().optional(),
  businessName: z.string().optional(),
  businessId: z.string().optional(),
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

export const MetaUserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type MetaUserProfile = z.infer<typeof MetaUserProfileSchema>;

export const MetaValidationResultSchema = z.object({
  valid: z.boolean(),
  profile: MetaUserProfileSchema.optional(),
  error: z.string().optional(),
});

export type MetaValidationResult = z.infer<typeof MetaValidationResultSchema>;
