import type { Session } from "@openai-harness/session";
import {
  createMetaAd,
  CreateMetaAdParams,
} from "@openai-harness/connector-meta";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface CreateMetaAdArgs extends Partial<CreateMetaAdParams> {
  ads?: CreateMetaAdParams[];
}

export const createMetaAdTool = defineTool({
  name: "createMetaAd",
  description:
    "Prerequisite: campaign-builder skill is a prerequisite.\n\n" +
    "Create advertising ad(s) on Meta Ads Manager under a specific Ad Set and Ad Account. Supports both static image creatives and motion/video creatives.",
  timeoutMs: 60000,
  isConcurrencySafe: () => false,
  parameters: {
    ads: {
      type: "array",
      description: "Array of ads to create (max 5 in parallel).",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          adAccountId: { type: "string", required: true },
          adSetId: { type: "string", required: true },
          name: { type: "string", required: true },
          status: { type: "string", enum: ["PAUSED", "ACTIVE"] },
          creative: {
            type: "object",
            required: true,
            additionalProperties: true,
            properties: {
              type: { type: "string", required: true, enum: ["image", "video"] },
              mediaUrl: { type: "string", required: true },
              headline: { type: "string", required: true },
              primaryText: { type: "string", required: true },
              destinationUrl: { type: "string", required: true },
            },
          },
        },
      },
    },
    adAccountId: { type: "string" },
    adSetId: { type: "string" },
    name: { type: "string" },
    status: { type: "string", enum: ["PAUSED", "ACTIVE"] },
    creative: {
      type: "object",
      additionalProperties: true,
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        summary: { type: "string", required: true },
        results: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              success: { type: "boolean", required: true },
              name: { type: "string", required: true },
            },
          },
        },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: (value as any).summary,
      },
    ],
    presentationMeta: (_args, value) => value,
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "execute",
    title: `Create Meta ad (${args.ads?.length || (args.name ? 1 : 0)})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "execute",
    title: "Meta ad(s) created",
    content: result.content,
  }),
  async execute(args, exec) {
    const userId = toolSession<Session>(exec).userId;
    if (!userId) {
      throw new Error("User authentication context required to create Meta ads.");
    }

    const adConfigs: CreateMetaAdParams[] = [];
    if (args.ads && Array.isArray(args.ads) && args.ads.length > 0) {
      adConfigs.push(...args.ads.slice(0, 5));
    } else if (
      args.adAccountId &&
      args.adSetId &&
      args.name &&
      args.creative
    ) {
      adConfigs.push({
        adAccountId: args.adAccountId,
        adSetId: args.adSetId,
        name: args.name,
        status: (args.status as any) || "PAUSED",
        creative: args.creative as any,
      });
    }

    if (adConfigs.length === 0) {
      throw new Error(
        "Ad details (adAccountId, adSetId, name, creative) or an ads array are required.",
      );
    }

    const results: Array<{
      success: boolean;
      name: string;
      adId?: string;
      status?: string;
      error?: string;
    }> = [];

    for (const adCfg of adConfigs) {
      try {
        const res = await createMetaAd({
          params: {
            adAccountId: adCfg.adAccountId,
            adSetId: adCfg.adSetId,
            name: adCfg.name,
            status: adCfg.status || "PAUSED",
            creative: adCfg.creative,
          },
          context: {
            userId,
            providerSlug: "meta",
          },
        });

        if (!res.success || !res.data) {
          results.push({
            success: false,
            name: adCfg.name,
            error: res.error?.message || "Failed to create ad",
          });
          continue;
        }

        results.push({
          success: true,
          name: adCfg.name,
          adId: res.data.id,
          status: adCfg.status || "PAUSED",
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          success: false,
          name: adCfg.name,
          error: msg,
        });
      }
    }

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    const lines: string[] = [
      `### Created Meta Ads: ${successful.length} succeeded, ${failed.length} failed\n`,
    ];

    for (const r of successful) {
      lines.push(
        `- **${r.name}** (\`${r.adId}\`): Status: ${r.status}`,
      );
    }
    for (const f of failed) {
      lines.push(`- **${f.name}** (Failed): ${f.error}`);
    }

    return {
      results,
      summary: lines.join("\n"),
    };
  },
});

