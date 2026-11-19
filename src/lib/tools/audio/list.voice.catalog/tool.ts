import {
  VoiceEntry,
  VoiceAccent,
  VoiceLanguage,
  getVoiceCatalogList,
} from "../utils";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import type { InputContentParam } from "openai/resources/beta/agents/agents";

export const listVoiceCatalogToolDefinition = {
  type: "function" as const,
  name: "listVoiceCatalog",
  description:
    "Discovers and lists curated marketing voice personas for speech synthesis and voice conversion. ",
  parameters: {
    type: "object",
    properties: {
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
  },
};

export interface ListVoiceCatalogArgs {
  language?: "all" | VoiceLanguage;
  gender?: "all" | "male" | "female";
  accent?: "all" | VoiceAccent;
}

export type ListVoiceCatalogInput = ToolInput<ListVoiceCatalogArgs>;

export async function executeListVoiceCatalogTool(
  input: ToolInput<ListVoiceCatalogArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  try {
    const args = input?.args || {};
    const voices = getVoiceCatalogList({
      gender: args.gender?.trim(),
      accent: args.accent?.trim(),
      language: args.language?.trim(),
    });

    const formattedList = voices.map((v: VoiceEntry, idx: number) => {
      return [
        `### ${idx + 1}. ${v.name}`,
        `- **voiceId**: \`${v.id}\``,
        `- **Language**: ${v.language}`,
        `- **Gender**: ${v.gender}`,
        `- **Accent**: ${v.accent}`,
        `- **Description**: ${v.description}`,
      ].join("\n");
    });

    const finalContent = [
      `Found ${voices.length} verified voice(s):\n`,
      ...formattedList,
    ].join("\n\n");

    return {
      success: true,
      data: {
        contentParts: [{ type: "input_text", text: finalContent }],
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Failed to list voice catalog: ${msg}`,
          },
        ],
      },
      error: msg,
    };
  }
}
