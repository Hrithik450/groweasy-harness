import type { Session } from "@openai-harness/session";
import { sessionEventsRepo } from "@openai-harness/session-persistence";
import { foldSurface } from "@openai-harness/session-projection";
import { defineTool } from "@openai-harness/tools";
import { toolSession } from "@openai-harness/tools";

export interface FetchSessionMessagesArgs {
  limit?: number;
  role?: "user" | "assistant" | "system" | "all";
  cursor?: string;
}

export const fetchSessionMessagesTool = defineTool({
  name: "fetchSessionMessages",
  description:
    "Retrieves the conversation message history for the current session.",
  timeoutMs: 15000,
  isConcurrencySafe: () => true,
  parameters: {
    limit: {
      type: "number",
      description:
        "Maximum number of messages to retrieve (defaults to 10, max 100).",
    },
    role: {
      type: "string",
      enum: ["all", "user", "assistant", "system"],
      description:
        "Filter messages by role: 'user' for user messages only, 'assistant' for assistant replies only, 'system' for system messages only, or 'all' for all messages. Defaults to 'all'.",
    },
    cursor: {
      type: "string",
      description:
        "Optional ISO 8601 timestamp cursor (createdAt) to fetch messages sent before this timestamp.",
    },
  },
  output: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        total: { type: "number", required: true },
        summary: { type: "string", required: true },
      },
    },
    render: (_args, value) => [
      {
        type: "text",
        text: value.summary,
      },
    ],
    presentationMeta: (_args, value) => ({ total: value.total }),
  },
  presentCall: (args) => ({
    card: "generic",
    kind: "fetch",
    title: `Fetch session messages (${args.role || "all"}, limit: ${args.limit ?? 10})`,
    rawInput: args,
  }),
  presentResult: (_args, result) => ({
    card: "generic",
    kind: "fetch",
    title: `Session messages fetched (${(result.meta as any)?.total ?? 0} messages)`,
    content: result.content,
  }),
  async execute(args, exec) {
    const sessionId = toolSession<Session>(exec).id;
    if (!sessionId) {
      throw new Error("Session context is required to fetch session messages.");
    }

    const limit =
      typeof args.limit === "number" && args.limit > 0
        ? Math.min(Math.floor(args.limit), 100)
        : 10;

    const roleFilter =
      args.role && args.role !== "all"
        ? (args.role as "user" | "assistant" | "system")
        : undefined;

    const events = await sessionEventsRepo.getEvents(sessionId);
    const surface = foldSurface(events, { sessionId }).filter(
      (item) => item.kind !== "context",
    );
    const messages = surface
      .filter((item) => !roleFilter || item.role === roleFilter)
      .filter((item) => !args.cursor || item.createdAt < args.cursor)
      .slice(0, limit);
    if (messages.length === 0) {
      return {
        total: 0,
        summary: "No historical messages found for this session.",
      };
    }

    const lines: string[] = [
      `### Session Messages (${messages.length} retrieved)\n`,
    ];

    for (const msg of messages) {
      const content = msg.content;
      const textParts: string[] = [];

      if (typeof content === "string") {
        textParts.push(content);
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "text" && part.text) {
            textParts.push(part.text);
          }
        }
      }

      const body = textParts.join(" ").trim() || "(empty content)";
      lines.push(
        `- **[${msg.role.toUpperCase()}]** (${new Date(msg.createdAt).toLocaleTimeString()}): ${body}`,
      );
    }

    return {
      total: messages.length,
      summary: lines.join("\n"),
    };
  },
});
