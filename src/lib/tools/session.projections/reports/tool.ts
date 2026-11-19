import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as errorResult } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { latestBarItemFor, saveBarItems } from "@/lib/bar/service";
import { uuidv7 } from "@/lib/utils/uuid";
import type { DailyReport } from "@/lib/detail.bar/types";
import { reportIsoDate } from "@/lib/utils/report.date";
import { validateAndNormalizeUI } from "@/lib/generative.ui";

type SaveReportOutput = {
  contentParts: Array<InputContentParam>;
};

export const updateReportsToolDefinition = {
  type: "function" as const,
  name: "updateReports",
  preSkills: "reports",
  description:
    "Prerequisite: reports skill is a prerequisite.\n\n" +
    "Saves one daily report as a UI-block spec into the Ad Strategist Reports tab. One report per day: re-running the same day updates that day's report.",
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
          "Flat UI-block spec { root, elements } for the report page: Stack root with Heading, Text, Metric, Table, and chart elements.",
        additionalProperties: true,
      },
    },
    required: ["title", "summary", "blocks"],
  },
};

/** One report as the tool accepts it; id and date come from the save time. */
export type UpdateReportsArgs = Partial<Omit<DailyReport, "id" | "createdAt">>;


function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function executeUpdateReportsTool(
  input: ToolInput<UpdateReportsArgs>,
): Promise<ToolOutput<SaveReportOutput>> {
  const userId = input.context?.userId;
  if (!userId) {
    return errorResult("User context is required to save a report.");
  }

  const args = input.args ?? {};
  const title = trimmed(args.title);
  const summary = trimmed(args.summary);
  let blocks: Record<string, unknown>;
  try {
    const normalized = validateAndNormalizeUI(args.blocks);
    if (!normalized) {
      return errorResult("Missing required argument 'blocks'.");
    }
    blocks = normalized;
  } catch (err: unknown) {
    return errorResult(err instanceof Error ? err.message : String(err));
  }

  const createdAt = new Date().toISOString();
  const today = reportIsoDate(createdAt);

  // One report per day: reuse today's report when the day is already written.
  const latest = latestBarItemFor(userId, "reports") as unknown as
    | DailyReport
    | null;
  const id =
    latest && reportIsoDate(latest.createdAt) === today ? latest.id : uuidv7();

  const saved = saveBarItems(userId, "reports", [
    { id, data: { title, summary, blocks, createdAt } },
  ]);
  if (!saved) {
    return errorResult("Ad Strategist session not found.");
  }

  // The report page lives under the Ad Strategist session that owns it.
  const url = ` View it at /c/${saved.session.id}/reports/${id}.`;

  return {
    success: true,
    data: {
      contentParts: [
        {
          type: "input_text",
          text: `Saved today's report "${title}" as ${id}.${url}`,
        },
      ],
    },
  };
}
