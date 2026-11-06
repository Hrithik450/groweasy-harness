import {
  IMAGE_TYPES_SLUG,
  ImageTypeSlug,
  imageClusters,
  imagePrompts,
} from "../utils";
import { defineTool } from "@openai-harness/tools";

export const fetchImageTypesTool = defineTool({
  name: "fetchImageTypes",
  description:
    "Prerequisite: static-ad or video-ad skill is a prerequisite.\n\n" +
    "Fetches calibrated, conversion-engineered static ad prompts for one or more visual image clusters/types.",
  timeoutMs: 10000,
  isConcurrencySafe: () => true,
  parameters: {
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
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        clustersCount: { type: "number", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ clustersCount: value.clustersCount }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "fetch",
    title: `Fetch image types (${args.types?.join(", ") || "all"})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: `Fetched image types (${(result.meta as any)?.clustersCount ?? 0} clusters)`,
    content: result.content,
  }),
  async execute(args) {
    const rawTypes = args.types ?? [];
    const fetchAll = rawTypes.length === 0 || rawTypes.includes("all");

    const slugs: ImageTypeSlug[] = fetchAll
      ? [...IMAGE_TYPES_SLUG]
      : (rawTypes.filter((t) =>
          IMAGE_TYPES_SLUG.includes(t as ImageTypeSlug),
        ) as ImageTypeSlug[]);

    if (slugs.length === 0) {
      throw new Error(
        `Invalid or unrecognized cluster types requested: ${JSON.stringify(rawTypes)}`,
      );
    }

    const sections: string[] = [
      `### Visual Ad Prompt Templates (${slugs.length} cluster${slugs.length === 1 ? "" : "s"})\n`,
    ];

    for (const slug of slugs) {
      const meta = imageClusters.find((c) => c.slug === slug);
      const prompts = imagePrompts[slug as ImageTypeSlug];
      if (!meta || !prompts) continue;

      sections.push(
        `#### Cluster (\`${slug}\`)\n` +
          `*${meta.description}*\n` +
          `**Examples**: ${meta.examples}\n\n` +
          "**Prompts**:\n" +
          prompts
            .map((p, i) => `${i + 1}. **${p.slug}**: \`${p.prompt}\``)
            .join("\n") +
          "\n",
      );
    }

    return {
      clustersCount: slugs.length,
      summary: sections.join("\n"),
    };
  },
});
