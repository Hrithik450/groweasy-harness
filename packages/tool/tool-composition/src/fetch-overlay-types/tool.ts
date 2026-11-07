import {
  OVERLAY_TYPES_SLUG,
  OverlayTypeSlug,
  overlayClusters,
  overlayTemplates,
} from "../render-element/utils";
import { defineTool } from "@openai-harness/tools";

export const fetchOverlayTypesTool = defineTool({
  name: "fetchOverlayTypes",
  description:
    "Prerequisite: static-ad skill is a prerequisite.\n\n" +
    "Fetches battle-tested, conversion-engineered vector SVG overlay templates for one or more overlay clusters/types. Returns customizable SVG markup containing layout geometry, typographic hierarchies, scrim gradients, callout badges, and CTA buttons to composite on top of generated ad photos.",
  timeoutMs: 10000,
  isConcurrencySafe: () => true,
  parameters: {
    types: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "all",
          "social_proof_and_trust",
          "comparison_and_education",
          "product_and_feature_showcase",
          "native_and_social_mockups",
          "offers_and_conversion_urgency",
          "local_and_lead_generation",
        ],
      },
      description:
        "Array of overlay cluster slugs to fetch. Options: 'social_proof_and_trust', 'comparison_and_education', 'product_and_feature_showcase', 'native_and_social_mockups', 'offers_and_conversion_urgency', 'local_and_lead_generation', or ['all'].",
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
    title: `Fetch overlay templates (${args.types?.join(", ") || "all"})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: `Fetched overlay templates (${(result.meta as any)?.clustersCount ?? 0} clusters)`,
    content: result.content,
  }),
  async execute(args) {
    const rawTypes = args.types ?? [];
    const fetchAll = rawTypes.length === 0 || rawTypes.includes("all");

    const slugs: OverlayTypeSlug[] = fetchAll
      ? [...OVERLAY_TYPES_SLUG]
      : (rawTypes.filter((t) =>
          OVERLAY_TYPES_SLUG.includes(t as OverlayTypeSlug),
        ) as OverlayTypeSlug[]);

    if (slugs.length === 0) {
      throw new Error(
        `Invalid or unrecognized overlay cluster types requested: ${JSON.stringify(rawTypes)}`,
      );
    }

    const sections: string[] = [
      `### Vector Overlay Templates (${slugs.length} cluster${slugs.length === 1 ? "" : "s"})\n`,
    ];

    for (const slug of slugs) {
      const meta = overlayClusters.find((c) => c.slug === slug);
      const templates = overlayTemplates[slug as OverlayTypeSlug] || [];
      if (!meta) continue;

      const templatePrompts = templates
        .map((t) => `##### Template: ${t.slug}\n\`\`\`xml\n${t.prompt.trim()}\n\`\`\``)
        .join("\n\n");

      sections.push(
        `#### ${meta.name} (\`${slug}\`)\n` +
          `*${meta.description}*\n` +
          `**Examples**: ${meta.examples}\n\n` +
          templatePrompts +
          "\n",
      );
    }

    return {
      clustersCount: slugs.length,
      summary: sections.join("\n"),
    };
  },
});
