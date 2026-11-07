import {
  VoiceAccent,
  VoiceLanguage,
  getVoiceCatalogList,
} from "../utils";
import { defineTool } from "@openai-harness/tools";

export const listVoiceCatalogTool = defineTool({
  name: "listVoiceCatalog",
  description:
    "Discovers and lists curated marketing voice personas for speech synthesis and voice conversion.",
  timeoutMs: 10000,
  isConcurrencySafe: () => true,
  parameters: {
    language: {
      type: "string",
      enum: ["all", "Hinglish", "English", "Hindi", "Kannada"],
      description: "Filter by language.",
    },
    gender: {
      type: "string",
      enum: ["all", "male", "female"],
      description: "Filter by gender.",
    },
    accent: {
      type: "string",
      enum: [
        "all",
        "american",
        "british",
        "australian",
        "indian",
        "canadian",
        "irish",
        "african",
        "italian",
        "spanish",
      ],
      description: "Filter by standard voice accent.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        total: { type: "number", required: true },
        summary: { type: "string", required: true },
        voices: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              id: { type: "string", required: true },
              name: { type: "string", required: true },
            },
          },
        },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ voices: value.voices }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "fetch",
    title: `List voice catalog (${args.language || "all"}, ${args.accent || "all"})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: `Voice catalog (${((result.meta as any)?.voices || []).length} voices)`,
    content: result.content,
  }),
  async execute(args) {
    const voices = getVoiceCatalogList({
      gender: args.gender?.trim(),
      language: args.language as VoiceLanguage,
      accent: args.accent as VoiceAccent,
    });

    const lines: string[] = [
      `### Voice Catalog (${voices.length} voice${voices.length === 1 ? "" : "s"} found)\n`,
    ];

    for (const v of voices) {
      lines.push(
        `- **${v.name}** (\`${v.id}\`): ${v.description} | Gender: ${v.gender} | Language: ${v.language} | Accent: ${v.accent}`,
      );
    }

    return {
      total: voices.length,
      voices: voices as any,
      summary: lines.join("\n"),
    };
  },
});
