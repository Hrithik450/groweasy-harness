import type { Session } from "@openai-harness/session";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";
import { mutateDetailBarState } from "@openai-harness/session-persistence";

type SuggestionIcon = "stop" | "shift" | "refresh" | "pause";
type SuggestionStatus = "pending" | "completed";

const SUGGESTION_ICONS: readonly SuggestionIcon[] = [
  "stop",
  "shift",
  "refresh",
  "pause",
];

interface SuggestionItem {
  id: string;
  title: string;
  description: string;
  savings?: string;
  icon?: SuggestionIcon;
  actionLabel: string;
  prompt: string;
  status?: SuggestionStatus;
}

function isSuggestionIcon(value: unknown): value is SuggestionIcon {
  return (
    typeof value === "string" &&
    (SUGGESTION_ICONS as readonly string[]).includes(value)
  );
}

export const updateSuggestionsTool = defineTool({
  name: "updateSuggestions",
  description:
    "Creates or updates actionable optimization suggestions in the Ad Manager DetailBar for the `suggestions` skill. " +
    "Each suggestion carries a one-tap action button that dispatches its `prompt` as hidden chat input, a quantified savings line, and an optional icon.",
  timeoutMs: 15000,
  isConcurrencySafe: () => false,
  parameters: {
    suggestions: {
      type: "array",
      required: true,
      description:
        "Array of 1 to 5 suggestion objects to create, merge, or update in the session DetailBar.",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          savings: { type: "string" },
          icon: {
            type: "string",
            enum: ["stop", "shift", "refresh", "pause"],
          },
          actionLabel: { type: "string", required: true },
          prompt: { type: "string", required: true },
          status: {
            type: "string",
            enum: ["pending", "completed"],
          },
        },
      },
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: true,
      properties: {
        count: { type: "number", required: true },
        summary: { type: "string", required: true },
        items: {
          type: "array",
          required: true,
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: (value as any).summary,
      },
    ],
    presentationMeta: (_args, value) => value,
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "edit",
    title: `Update suggestions (${args.suggestions?.length ?? 0} items)`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "edit",
    title: "Suggestions updated",
    content: result.content,
  }),
  async execute(args, exec) {
    const session = toolSession<Session>(exec);
    const userId = session.userId;
    const sessionId = session.id;

    if (!userId || !sessionId) {
      throw new Error(
        "Authentication and session context are required to update suggestions.",
      );
    }

    const rawItems = args.suggestions;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new Error("The 'suggestions' array parameter is required.");
    }

    let formattedItems: SuggestionItem[] = [];

    await mutateDetailBarState(sessionId, "adManager", (current) => {
      const existingItems: SuggestionItem[] = Array.isArray(current.data.suggestions)
        ? (current.data.suggestions as SuggestionItem[])
        : [];
      const existingMap = new Map<string, SuggestionItem>();
      for (const es of existingItems) {
        existingMap.set(es.id, es);
      }

      const nextItems: SuggestionItem[] = [];
      for (const s of rawItems.slice(0, 5)) {
        const existing = s.id ? existingMap.get(s.id) : undefined;

        const icon = isSuggestionIcon(s.icon)
          ? s.icon
          : existing?.icon;

        const savings =
          typeof s.savings === "string"
            ? s.savings
            : existing?.savings;

        const item: SuggestionItem = {
          id:
            s.id ||
            existing?.id ||
            `suggestion-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title: s.title || existing?.title || "Suggestion",
          description: s.description || existing?.description || "",
          ...(savings !== undefined ? { savings } : {}),
          ...(icon !== undefined ? { icon } : {}),
          actionLabel: s.actionLabel || existing?.actionLabel || "",
          prompt: s.prompt || existing?.prompt || "",
          status: (s.status as SuggestionStatus) || existing?.status || "pending",
        };

        nextItems.push(item);
      }

      const mergedItems = [...existingItems];
      for (const fi of nextItems) {
        const idx = mergedItems.findIndex((it) => it.id === fi.id);
        if (idx >= 0) {
          mergedItems[idx] = fi;
        } else {
          mergedItems.unshift(fi);
        }
      }

      formattedItems = nextItems;

      return {
        ...current,
        type: "adManager",
        data: {
          ...current.data,
          suggestions: mergedItems,
        },
      };
    });

    const summary = `Successfully updated ${formattedItems.length} suggestion(s) in the Ad Manager DetailBar.`;

    return {
      count: formattedItems.length,
      items: formattedItems as any,
      summary,
    };
  },
});
