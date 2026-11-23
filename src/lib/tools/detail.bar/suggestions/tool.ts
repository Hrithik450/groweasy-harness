import { uuidv7 } from "@/lib/utils/uuid";
import { ToolInput, ToolOutput } from "@/lib/tools/types";
import {
  readBarItemFor,
  resolveDetailBarSession,
  upsertDetailBarItems,
} from "@/lib/detail.bar/service";
import { toolFailure as failure } from "@/lib/tools/utils";
import type { InputContentParam } from "openai/resources/beta/agents/agents";
import { validateAndNormalizeUI } from "@/lib/generative.ui";
import { type BarItemInput } from "@/lib/detail.bar/service";
import type {
  BarCard,
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
            meta: {
              type: "object",
              description: "Meta identifiers the suggestion applies to.",
              properties: {
                adAccountId: {
                  type: "string",
                  description: "e.g. 'act_1202159847230100'.",
                },
                campaignId: { type: "string", description: "Campaign ID." },
                adSetId: {
                  type: "string",
                  description: "Ad set ID, if relevant.",
                },
                adId: { type: "string", description: "Ad ID, if relevant." },
                creativeId: {
                  type: "string",
                  description: "Meta creative ID, if relevant.",
                },
              },
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
  Omit<Suggestion, "createdAt" | "meta" | "action" | "note">
> & {
  status?: AlertStatus;
  meta?: Partial<AlertMeta>;
  action?: Partial<AlertAction>;
};

export interface UpdateSuggestionsArgs {
  suggestions?: SuggestionItemInput[];
}

function mergeSuggestion(
  item: SuggestionItemInput,
  existing: BarCard<Suggestion> | undefined,
): { status: AlertStatus; data: Suggestion } {
  const rawMeta = item.meta ?? {};
  const adAccountId =
    rawMeta.adAccountId?.trim() || existing?.meta.adAccountId || "";
  const campaignId =
    rawMeta.campaignId?.trim() || existing?.meta.campaignId || "";
  const adSetId = rawMeta.adSetId?.trim() || existing?.meta.adSetId;
  const adId = rawMeta.adId?.trim() || existing?.meta.adId;
  const creativeId = rawMeta.creativeId?.trim() || existing?.meta.creativeId;

  const rawAction =
    typeof item.action === "object" && item.action !== null ? item.action : {};
  // Older rows stored the fix as a bare string.
  const stringFix =
    typeof (item.action as unknown) === "string"
      ? String(item.action).trim()
      : "";
  const fix = rawAction.fix?.trim() || stringFix || existing?.action.fix || "";
  const before =
    rawAction.before !== undefined
      ? rawAction.before?.trim()
      : existing?.action.before;
  const after =
    rawAction.after !== undefined
      ? rawAction.after?.trim()
      : existing?.action.after;

  const chart = item.chart ?? existing?.chart;
  // The note belongs to the user; a re-emitted suggestion keeps it as-is.
  const note = existing?.note;

  const status = item.status || existing?.status || "pending";
  const data = {
    id: item.id?.trim() || existing?.id || uuidv7(),
    title: item.title?.trim() || existing?.title || "Account Diagnostic Item",
    description: item.description?.trim() || existing?.description || "",
    meta: {
      adAccountId,
      campaignId,
      ...(adSetId ? { adSetId } : {}),
      ...(adId ? { adId } : {}),
      ...(creativeId ? { creativeId } : {}),
    },
    action: {
      fix,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    },
    ...(chart ? { chart } : {}),
    ...(note ? { note } : {}),
  };

  return { status, data };
}

/** Normalise one submitted chart; returns an error string when invalid. */
function normaliseChart(chart: Record<string, unknown> | undefined): {
  chart?: Record<string, unknown>;
  error?: string;
} {
  if (chart === undefined) return {};
  try {
    return { chart: validateAndNormalizeUI(chart) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
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

  const items: BarItemInput[] = [];
  const owner = resolveDetailBarSession(userId, "suggestions");
  if (!owner) {
    return failure(
      "Ad Manager session not found for this user; suggestions were not saved.",
    );
  }

  for (const item of rawItems.slice(0, MAX_SUGGESTIONS_PER_CALL)) {
    const normalized = normaliseChart(item.chart);
    if (normalized.error !== undefined) {
      return failure(normalized.error);
    }

    const existing =
      typeof item.id === "string" && item.id.trim()
        ? (readBarItemFor(
            userId,
            "suggestions",
            item.id.trim(),
          ) as BarCard<Suggestion> | null)
        : null;

    const suggestion = mergeSuggestion(
      normalized.chart ? { ...item, chart: normalized.chart } : item,
      existing ?? undefined,
    );
    items.push({
      id: suggestion.data.id,
      status: suggestion.status,
      data: suggestion.data,
    });
  }

  try {
    const written = upsertDetailBarItems(owner, "suggestions", items);

    const itemSummaries = written
      .map(
        (a: Record<string, unknown>) =>
          `- ID: ${String(a.id)} ("${String(a.title ?? "")}")`,
      )
      .join("\n");

    return {
      success: true,
      data: {
        contentParts: [
          {
            type: "input_text",
            text: `Saved ${written.length} suggestion(s):\n${itemSummaries}`,
          },
        ],
      },
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return failure(`Saving suggestions failed: ${errorMsg}`);
  }
}
