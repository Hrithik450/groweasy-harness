import {
  createMetaCreative,
  MetaCallToActionType,
  type MetaCreativeParams,
} from "@/lib/connectors/meta.ads";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const createMetaCreativeToolDefinition = {
  type: "function" as const,
  name: "createMetaCreative",
  description:
    "Create an immutable Meta ad creative (page + media + copy + CTA) and return its creativeId. Feed that id to `upsertMetaAd`. Changing content later needs a new creative.",
  parameters: {
    type: "object",
    properties: {
      adAccountId: {
        type: "string",
        description:
          'Meta ad account id. Get it from `fetchMetaAdAccounts`. (e.g.: "act_123456789").',
      },
      pageId: {
        type: "string",
        description:
          "Facebook Page id from `fetchMetaPages`. Optional only when the account manages exactly one Page.",
      },
      name: {
        type: "string",
        description:
          'Creative name, 3-8 words. (e.g.: "Diwali — Winner Static").',
      },
      type: {
        type: "string",
        enum: ["image", "video"],
        description: "Creative format.",
      },
      headline: {
        type: "string",
        description: 'Ad headline, max 5 words. (e.g.: "Flat 40% Off").',
      },
      primaryText: {
        type: "string",
        description:
          'Primary copy, 1-2 short sentences. (e.g.: "Festive offers on every order. Shop today.").',
      },
      description: {
        type: "string",
        description:
          'Supporting line under the headline. (e.g.: "Free delivery").',
      },
      callToAction: {
        type: "string",
        enum: Object.values(MetaCallToActionType),
        description:
          'Meta CTA button. (e.g.: "SHOP_NOW", "LEARN_MORE", "SIGN_UP").',
      },
      destinationUrl: {
        type: "string",
        description: 'Landing page URL. (e.g.: "https://example.com/sale").',
      },
      imageHash: {
        type: "string",
        description:
          "Image creatives: hash returned by `uploadMetaAsset` for an uploaded image.",
      },
      videoId: {
        type: "string",
        description:
          "Video creatives: id returned by `uploadMetaAsset` for an uploaded video.",
      },
    },
    required: [
      "type",
      "name",
      "headline",
      "primaryText",
      "adAccountId",
      "callToAction",
      "destinationUrl",
    ],
  },
};

export async function executeCreateMetaCreativeTool(
  input: ToolInput<MetaCreativeParams>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  const args = input.args;

  if (!userId) return failure("User authentication context required.");
  if (!args?.adAccountId || !args.type) {
    return failure("adAccountId and type are required.");
  }
  if (
    !args.name ||
    !args.headline ||
    !args.primaryText ||
    !args.destinationUrl
  ) {
    return failure(
      "name, headline, primaryText, and destinationUrl are required.",
    );
  }
  if (args.type === "image" && !args.imageHash) {
    return failure("Image creatives need imageHash; upload the image first.");
  }
  if (args.type === "video" && !args.videoId) {
    return failure("Video creatives need videoId; upload the video first.");
  }

  const res = await createMetaCreative({
    params: args,
    context: { userId, providerSlug: "meta" },
  });

  if (!res.success || !res.data?.creativeId) {
    return failure(res.error?.message || "Failed to create Meta creative.");
  }

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: JSON.stringify(res.data),
        },
      ],
    },
  };
}
