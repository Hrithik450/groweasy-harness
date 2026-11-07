import type { Session } from "@openai-harness/session";
import type {
  AdStrategistDetailBarData,
  AdStrategistDocument,
} from "@openai-harness/client-ui-detail-bar";
import {
  getSessionByUserIdAndSlug,
  mutateDetailBarState,
} from "@openai-harness/session-persistence";
import { defineTool, toolSession } from "@openai-harness/tools";
import { latestMessageId } from "@openai-harness/session";

export interface SaveCampaignBriefArgs {
  title: string;
  content: string;
}

/** Newest briefs first, the rest of the document list preserved. */
const MAX_DOCUMENTS = 50;

export const saveCampaignBriefTool = defineTool({
  name: "saveCampaignBrief",
  description:
    "Persists a campaign brief into the Ad Strategist Campaign brief tab so it survives reload and can be opened from that tab.",
  timeoutMs: 15000,
  isConcurrencySafe: () => false,
  parameters: {
    title: {
      type: "string",
      required: true,
      description:
        "3-5 words naming the brief, e.g. 'Cold-pressed oils Bangalore brief'. No dates.",
    },
    content: {
      type: "string",
      required: true,
      description:
        "20-30 word summary of the brief: objective, audience, core promise, and the direction proposed.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ title: value.title }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "edit",
    title: `Save campaign brief: "${args.title}"`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "edit",
    title: `Campaign brief saved: ${(result.meta as any)?.title ?? ""}`,
    content: result.content,
  }),
  async execute(args, exec) {
    const session = toolSession<Session>(exec);
    const userId = session.userId;
    if (!userId) {
      throw new Error(
        "User authentication context is required to save a campaign brief.",
      );
    }

    const title = args.title?.trim();
    if (!title) {
      throw new Error("Missing required argument 'title'.");
    }

    const content = (args.content ?? "").trim();
    const createdAt = new Date().toISOString();
    const brief: AdStrategistDocument = {
      id: `brief-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      content,
      kind: "Campaign brief",
      icon: "brief",
      dateLabel: "today",
      createdAt,
      messageId: latestMessageId(session, "assistant") ?? "",
      isActive: true,
    };

    const sessionRes = await getSessionByUserIdAndSlug(userId, "adStrategist");
    if (!sessionRes.success || !sessionRes.data) {
      throw new Error(sessionRes.error || "Ad Strategist session not found.");
    }

    await mutateDetailBarState(
      sessionRes.data.id,
      "adStrategist",
      (current) => {
        const currentData =
          current.data as unknown as AdStrategistDetailBarData;
        const existing = Array.isArray(currentData.documents)
          ? currentData.documents
          : [];
        return {
          ...current,
          type: "adStrategist",
          data: {
            ...currentData,
            documents: [
              brief,
              ...existing.map((document) => ({
                ...document,
                isActive: false,
              })),
            ].slice(0, MAX_DOCUMENTS),
          },
        };
      },
    );

    return {
      title,
      summary: `Campaign brief "${title}" saved to the Ad Strategist Campaign brief tab.`,
    };
  },
});
