import { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  IMAGE_TYPES_SLUG,
  ImageTypeSlug,
  imageClusters,
  imagePrompts,
} from "../utils";

export const fetchImageTypesToolDefinition = {
  type: "function" as const,
  name: "fetchImageTypes",
  description:
    "Fetches calibrated, conversion-engineered static ad prompts for one or more visual image clusters/types.",
  parameters: {
    type: "object",
    properties: {
      types: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "all",
            "pain_and_problem",
            "transformation_and_lifestyle",
            "product_and_ecommerce",
            "native_and_social",
            "local_and_brand_authenticity",
            "festive_and_retail_posters",
          ],
        },
        description:
          "Array of visual cluster/group slugs to fetch. Options: 'pain_and_problem', 'transformation_and_lifestyle', 'product_and_ecommerce', 'native_and_social', 'local_and_brand_authenticity', 'festive_and_retail_posters', or ['all'].",
      },
    },
  },
};

export interface FetchImageTypesArgs {
  types?: ("all" | ImageTypeSlug)[];
}

export async function executeFetchImageTypesTool(
  input: ToolInput<FetchImageTypesArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  try {
    const rawTypes = input?.args?.types ?? [];
    const fetchAll = rawTypes.length === 0 || rawTypes.includes("all");

    const slugs: ImageTypeSlug[] = fetchAll
      ? [...IMAGE_TYPES_SLUG]
      : (rawTypes.filter((t) =>
          IMAGE_TYPES_SLUG.includes(t as ImageTypeSlug),
        ) as ImageTypeSlug[]);

    if (slugs.length === 0) {
      return {
        success: false,
        error: `Invalid or unrecognized cluster types requested: ${JSON.stringify(rawTypes)}`,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `No valid clusters found for: ${JSON.stringify(rawTypes)}. Available clusters: ${IMAGE_TYPES_SLUG.join(", ")}`,
            },
          ],
        },
      };
    }

    const sections: string[] = [];

    for (const groupSlug of slugs) {
      const cluster = imageClusters.find((c) => c.slug === groupSlug);
      const prompts = imagePrompts[groupSlug] ?? [];

      const promptBlocks = prompts
        .map(
          (p, idx) =>
            `#### ${idx + 1}. Archetype: \`${p.slug}\`\n**Full Prompt Specification:**\n${p.prompt}`,
        )
        .join("\n\n");

      sections.push(
        [
          `### Visual Cluster: \`${groupSlug}\``,
          cluster ? `**Description:** ${cluster.description}` : "",
          cluster ? `**Examples:** ${cluster.examples}` : "",
          `\n**Calibrated Prompt Templates (${prompts.length}):**\n`,
          promptBlocks,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    const resultText = [
      `Retrieved ${slugs.length} visual cluster(s):\n`,
      ...sections,
    ].join("\n\n");

    return {
      success: true,
      data: {
        contentParts: [{ type: "input_text", text: resultText }],
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: msg,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Failed to fetch image types: ${msg}`,
          },
        ],
      },
    };
  }
}
