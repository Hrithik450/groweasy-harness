import type { ToolInput, ToolOutput } from "@/lib/tools/types";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { allBarFields, isBarField } from "@/lib/detail.bar/fields";
import { readBarPageFor, resolveBarSession } from "@/lib/bar/service";

type FetchDetailBarOutput = { contentParts: Array<InputContentParam> };

export const fetchDetailBarToolDefinition = {
  type: "function" as const,
  name: "fetchDetailBar",
  description:
    "Reads one saved list from the detail bar, newest first. Use it before writing so you do not repeat rows. Page older entries with the returned `nextCursor`.",
  parameters: {
    type: "object",
    properties: {
      field: {
        type: "string",
        enum: allBarFields(),
        description: "Which list to read.",
      },
      limit: {
        type: "number",
        description: "Rows per page, 1 to 50. Defaults to 10.",
      },
      cursor: {
        type: "string",
        description:
          "The `nextCursor` returned by the previous page. Omit for the newest page.",
      },
    },
    required: ["field"],
  },
};

export interface FetchDetailBarArgs {
  field?: string;
  limit?: number;
  cursor?: string;
}


export async function executeFetchDetailBarTool(
  input: ToolInput<FetchDetailBarArgs>,
): Promise<ToolOutput<FetchDetailBarOutput>> {
  const userId = input.context?.userId;
  if (!userId) {
    return failure("User authentication context is required to read the detail bar.");
  }

  const field = input.args?.field;
  if (!isBarField(field)) {
    return failure(
      `Unknown list '${String(field)}'. Expected one of: ${allBarFields().join(", ")}.`,
    );
  }

  const session = resolveBarSession(userId, field);
  if (!session) {
    return failure(`No session owns the '${field}' list for this user.`);
  }

  const rawLimit = input.args?.limit;
  const limit =
    typeof rawLimit === "number" && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), 50)
      : 10;
  const cursor =
    typeof input.args?.cursor === "string" && input.args.cursor.length > 0
      ? input.args.cursor
      : undefined;

  try {
    const page = readBarPageFor(session.id, field, { limit, cursor });
    const payload = JSON.stringify(
      { field, items: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore },
      null,
      2,
    );
    const preamble =
      page.items.length === 0
        ? `No '${field}' rows saved yet.`
        : `Newest ${page.items.length} of '${field}'${page.hasMore ? " (more available: pass nextCursor as cursor)" : ""}:`;

    return {
      success: true,
      data: {
        contentParts: [{ type: "input_text", text: `${preamble}\n\n${payload}` }],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return failure(`Reading '${field}' failed: ${errorMsg}`);
  }
}
