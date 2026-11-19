import { uuidv7 } from "@/lib/utils/uuid";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import { readBarItemFor, resolveBarSession, saveBarItems } from "@/lib/bar/service";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { validateAndNormalizeUI } from "@/lib/generative.ui";
import { type BarItemInput } from "@/lib/bar/items.repo";
import type {
  AlertMeta,
  Suggestion,
  AlertStatus,
  AlertAction,
} from "@/lib/detail.bar";

/** Suggestions accepted per call; the bar keeps the rest. */
const MAX_SUGGESTIONS_PER_CALL = 5;

type UpdateSuggestionsOutput = {
  contentParts: Array<InputContentParam>;
};

export const updateSuggestionsToolDefinition = {
  type: "function" as const,
  name: "updateSuggestions",
  preSkills: "suggestions",
  description:
    "Prerequisite: suggestions skill is a prerequisite.\n\n" +
    "Creates or updates suggestions in the Ad Manager Suggestions tab. Returns only the rows that changed.",
  parameters: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        maxItems: MAX_SUGGESTIONS_PER_CALL,
        description:
          "1 to 5 suggestions to persist or update, ranked by money value. Hold the rest.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "Existing suggestion ID to update. Omit to create a new one.",
            },
            title: {
              type: "string",
              description:
                "Short headline: insight plus where it applies (e.g. 'High-Yield Placement · Instagram Reels').",
            },
            action: {
              type: "object",
              description:
                "One tappable action with a before/after preview. Never vague advice like 'adjust bids' or 'test variations'.",
              properties: {
                fix: {
                  type: "string",
                  description:
                    "Action button text: '<action> · Save ~₹X/mo by <how, naming the ad/ad set/campaign>' (e.g. 'Stop ad \"Summer Sale v2\" · Save ~₹14,500/mo by moving its budget to ad \"Summer Sale v1\"'). Calculate ₹X from real spend and metrics; show only the final number.",
                },
                before: {
                  type: "string",
                  description:
                    "What exists now, as data, with the key numbers.",
                },
                after: {
                  type: "string",
                  description:
                    "What will change once tapped, as concrete staged changes, not predicted results.",
                },
              },
              required: ["fix"],
            },
            chart: {
              type: "object",
              description:
                "Optional. Include only if a trend makes the opportunity obvious at a glance to a non-technical user.",
            },
          },
          required: ["title", "description", "action"],
        },
      },
    },
    required: ["suggestions"],
  },
};

/** One suggestion as the tool accepts it; the store records the time. */
export type SuggestionItemInput = Partial<
  Omit<Suggestion, "createdAt" | "meta" | "action">
> & {
  meta?: Partial<AlertMeta>;
  action?: Partial<AlertAction>;
};

export interface UpdateSuggestionsArgs {
  suggestions?: SuggestionItemInput[];
}

export async function executeUpdateSuggestionsTool(
  input: ToolInput<UpdateSuggestionsArgs>,
): Promise<ToolOutput<UpdateSuggestionsOutput>> {
  const userId = input.context?.userId;

  if (!userId) {
    return failure(
      "User authentication context is required to update suggestions.",
    );
  }

  const rawItems = input.args?.suggestions;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return failure("The 'suggestions' array parameter is required.");
  }

  const formattedItems: Suggestion[] = [];
  // A dismissal is the user's; a fresh run never reopens it.
  const owner = resolveBarSession(userId, "suggestions");

  for (const a of rawItems.slice(0, MAX_SUGGESTIONS_PER_CALL)) {
    let normalizedChart: Record<string, unknown> | undefined = undefined;
    if (a.chart !== undefined) {
      try {
        normalizedChart = validateAndNormalizeUI(a.chart);
      } catch (err) {
        return failure(err instanceof Error ? err.message : String(err));
      }
    }

    const rawMeta: Partial<AlertMeta> = a.meta ?? {};
    const meta: AlertMeta = {
      adAccountId: rawMeta.adAccountId || "",
      campaignId: rawMeta.campaignId || "",
      adSetId: rawMeta.adSetId,
      adId: rawMeta.adId,
    };

    const rawAction: Partial<AlertAction> =
      typeof a.action === "object" && a.action !== null ? a.action : {};
    const actionFix =
      rawAction.fix || (typeof a.action === "string" ? a.action : "");

    const title = a.title || "Account Diagnostic Item";
    const actionObj: AlertAction = {
      fix: actionFix,
      before:
        rawAction.before ||
        (actionFix ? `Current performance baseline for "${title}"` : undefined),
      after:
        rawAction.after ||
        (actionFix ? `Execute remediation plan for "${title}"` : undefined),
    };

    const id = a.id || uuidv7();
    const stored = owner
      ? (readBarItemFor(userId, "suggestions", id) as Suggestion | null)
      : null;
    const status: AlertStatus =
      stored?.status === "completed"
        ? "completed"
        : (a.status as AlertStatus) || "pending";

    const itemObj: Suggestion = {
      id,
      title,
      description: a.description || "",
      status,
      meta,
      action: actionObj,
      chart: normalizedChart,
    };

    formattedItems.push(itemObj);
  }

  const items: BarItemInput[] = formattedItems.map((item) => ({
    id: item.id,
    data: item,
  }));

  try {
    const written = saveBarItems(userId, "suggestions", items);
    if (!written) {
      return failure(
        "Ad Manager session not found for this user; suggestions were not saved.",
      );
    }

    const itemSummaries = written.items
      .map((a) => `- ID: ${a.id} ("${String(a.title ?? "")}")`)
      .join("\n");

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Saved ${written.items.length} suggestion(s):\n${itemSummaries}`,
          },
        ],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return failure(`Saving suggestions failed: ${errorMsg}`);
  }
}
