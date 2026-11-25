import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as errorResult } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import {
  upsertDetailBarItems,
  latestBarItemFor,
  resolveDetailBarSession,
} from "@/lib/detail.bar/service";
import { uuidv7 } from "@/lib/utils/uuid";
import { reportIsoDate } from "@/lib/utils/report.date";
import type { DailyReport } from "@/lib/detail.bar/types";
import { saveArtifact } from "@/lib/tools/artifact.save";

export const updateDailyReportToolDefinition = {
  type: "function" as const,
  name: "updateDailyReport",
  preSkills: "daily-report",
  description:
    "Prerequisite: reports skill is a prerequisite.\n\n" +
    "Saves one daily report as a UI-block spec into the session.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Report headline, max 8 words.",
      },
      summary: {
        type: "string",
        description: "One-sentence takeaway, max 30 words.",
      },
      blocks: {
        type: "object",
        description:
          "Flat UI-block spec { root, elements } for the report page: Stack root with Heading, Text, Table, cards, and chart elements.",
        additionalProperties: true,
      },
    },
    required: ["title", "summary", "blocks"],
  },
};

/** One report as the tool accepts it; id and date come from the save time. */
export type UpdateDailyReportArgs = Partial<
  Omit<DailyReport, "id" | "createdAt">
>;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function executeUpdateDailyReportTool(
  input: ToolInput<UpdateDailyReportArgs>,
): Promise<ToolOutput<{ contentParts: Array<InputContentParam> }>> {
  const userId = input.context?.userId;
  if (!userId) {
    return errorResult("User context is required to save a report.");
  }

  const args = input.args ?? {};
  const title = trimmed(args.title);
  const summary = trimmed(args.summary);
  if (args.blocks == null) {
    return errorResult("Missing required argument 'blocks'.");
  }

  const createdAt = new Date().toISOString();
  const today = reportIsoDate(createdAt);

  // One report per day: reuse today's report when the day is already written.
  const latest = latestBarItemFor(
    userId,
    "reports",
  ) as unknown as DailyReport | null;
  const id =
    latest && reportIsoDate(latest.createdAt) === today ? latest.id : uuidv7();

  const session = resolveDetailBarSession(userId, "reports");
  if (!session) {
    return errorResult("Ad Strategist session not found.");
  }

  const saved = await saveArtifact({
    rawSpec: args.blocks,
    skillName: "daily-report",
    context: input.context,
    persist: (spec) => {
      upsertDetailBarItems(session, "reports", [
        { id, data: { title, summary, blocks: spec, createdAt } },
      ]);
    },
  });

  if (!saved.ok) {
    return errorResult(saved.error);
  }

  const url = ` View it at /c/${session.id}/reports/${id}.`;

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Saved today's report "${title}" as ${id} and displayed it in chat.${url}`,
        },
      ],
    },
  };
}
