import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { allDetailBarFields, isDetailBarField } from "@/lib/detail.bar/fields";
import {
  getDetailBarPage,
  resolveDetailBarSession,
} from "@/lib/detail.bar/service";
import { getDetailBarPagesInDateRange } from "@/lib/detail.bar/items.repo";
import { dayRangeToIso } from "@/lib/utils/date.range";

type FetchDetailBarOutput = { contentParts: Array<InputContentParam> };

export const fetchDetailBarToolDefinition = {
  type: "function" as const,
  name: "fetchDetailBar",
  description:
    "Reads one saved list from the detail bar, newest first. Use it before writing so you do not repeat rows. Page older entries with `nextCursor`, pass `startDate`/`endDate` to read an inclusive date range, or pass `hours` to read a rolling window ending now.",
  parameters: {
    type: "object",
    properties: {
      field: {
        type: "string",
        enum: allDetailBarFields(),
        description: "Which list to read.",
      },
      limit: {
        type: "number",
        description:
          "Rows returned, 1 to 50 for pages, up to 100 with a date range. Defaults to 10, or 50 with dates.",
      },
      cursor: {
        type: "string",
        description:
          "The `nextCursor` returned by the previous page. Omit for the newest page.",
      },
      startDate: {
        type: "string",
        description:
          "Optional inclusive start day, YYYY-MM-DD in the app timezone.",
      },
      endDate: {
        type: "string",
        description:
          "Optional inclusive end day, YYYY-MM-DD in the app timezone.",
      },
      hours: {
        type: "number",
        description:
          "Optional rolling window in hours, ending now. Use 24 for the last 24 hours. Cannot be combined with startDate/endDate.",
      },
    },
    required: ["field"],
  },
};

export interface FetchDetailBarArgs {
  field?: string;
  limit?: number;
  cursor?: string;
  startDate?: string;
  endDate?: string;
  hours?: number;
}

export async function executeFetchDetailBarTool(
  input: ToolInput<FetchDetailBarArgs>,
): Promise<ToolOutput<FetchDetailBarOutput>> {
  const userId = input.context?.userId;
  if (!userId) {
    return failure(
      "User authentication context is required to read the detail bar.",
    );
  }

  const field = input.args?.field;
  if (!isDetailBarField(field)) {
    return failure(
      `Unknown list '${String(field)}'. Expected one of: ${allDetailBarFields().join(", ")}.`,
    );
  }

  const session = resolveDetailBarSession(userId, field);
  if (!session) {
    return failure(`No session owns the '${field}' list for this user.`);
  }

  const startDate = input.args?.startDate?.trim();
  const endDate = input.args?.endDate?.trim();
  const hasRange = Boolean(startDate || endDate);
  if (hasRange && (!startDate || !endDate)) {
    return failure("Pass both startDate and endDate, or neither.");
  }

  const hours =
    typeof input.args?.hours === "number" && input.args.hours > 0
      ? input.args.hours
      : null;
  if (hours !== null && hasRange) {
    return failure("Pass either hours or startDate/endDate, not both.");
  }
  const hasWindow = hasRange || hours !== null;

  const rawLimit = input.args?.limit;
  const limit =
    typeof rawLimit === "number" && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), hasWindow ? 100 : 50)
      : hasWindow
        ? 50
        : 10;
  const cursor =
    typeof input.args?.cursor === "string" && input.args.cursor.length > 0
      ? input.args.cursor
      : undefined;

  try {
    if (hours !== null) {
      const endIso = new Date().toISOString();
      const startIso = new Date(Date.now() - hours * 3_600_000).toISOString();
      const rows = getDetailBarPagesInDateRange(
        session.id,
        field,
        startIso,
        endIso,
      );
      const items = rows.slice(0, limit).map((row) => {
        const data = { ...(row.data as Record<string, unknown>) };
        delete data.blocks;
        return data;
      });
      const label = `the last ${hours} hours`;
      const preamble =
        rows.length === 0
          ? `No '${field}' rows created in ${label}.`
          : `${rows.length} '${field}' row(s) created in ${label} (showing ${items.length}):`;

      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `${preamble}\n\n${JSON.stringify(
                { field, hours, count: rows.length, items },
                null,
                2,
              )}`,
            },
          ],
        },
      };
    }

    if (hasRange) {
      const range = dayRangeToIso(startDate!, endDate!);
      const rows = getDetailBarPagesInDateRange(
        session.id,
        field,
        range.startIso,
        range.endIso,
      );
      const items = rows.slice(0, limit).map((row) => {
        const data = { ...(row.data as Record<string, unknown>) };
        delete data.blocks;
        return data;
      });
      const preamble =
        rows.length === 0
          ? `No '${field}' rows created between ${startDate} and ${endDate}.`
          : `${rows.length} '${field}' row(s) created between ${startDate} and ${endDate} (showing ${items.length}):`;

      return {
        success: true,
        data: {
          contentParts: [
            {
              type: "input_text",
              text: `${preamble}\n\n${JSON.stringify(
                { field, startDate, endDate, count: rows.length, items },
                null,
                2,
              )}`,
            },
          ],
        },
      };
    }

    const page = getDetailBarPage(session.id, field, { limit, cursor });
    const items = page.items.map((item) => {
      if (!("blocks" in item)) return item;
      const copy = { ...item };
      delete copy.blocks;
      return copy;
    });
    const payload = JSON.stringify(
      { field, items, nextCursor: page.nextCursor },
      null,
      2,
    );
    const preamble =
      page.items.length === 0
        ? `No '${field}' rows saved yet.`
        : `Newest ${page.items.length} of '${field}'${page.nextCursor ? " (more available: pass nextCursor as cursor)" : ""}:`;

    return {
      success: true,
      data: {
        contentParts: [
          { type: "input_text", text: `${preamble}\n\n${payload}` },
        ],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return failure(`Reading '${field}' failed: ${errorMsg}`);
  }
}
