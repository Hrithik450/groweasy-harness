/**
 * Agent-loop composition for this app.
 *
 * Turn ordering, the durable inbox, assistant framing, and tool-call scheduling
 * are owned by `@/lib/core/agent/loop`. The loop reaches this app only through its
 * `AgentLoopHost`; this module binds that host to the model drivers, session
 * derivation, tool registry, and tool dispatcher composed beside it.
 *
 * @module @/lib/core/agent/host-adapter
 */

import { getOpenAIModel } from "@/lib/core/agent/client";
import {
  configureAgentLoop,
  type AgentLoopHost,
  type ExecuteToolOutput,
  type ToolExecutionInput,
  type ToolExecutionMode,
  type ToolExecutionRequest,
} from "@/lib/core/agent/loop/host";
import type { SessionEvent } from "@/lib/core/agent/session-types";
import type { SessionEvent as CoreSessionEvent } from "@/lib/core/session/events";
import type {
  ModelDriver,
  ModelMessage,
  ModelToolCall,
} from "@/lib/llm/llm/driver";
import type { ImageAttachmentRef } from "@/lib/attachments/core/types";
import type { ContentBlock, Message } from "@/lib/llm/llm/message";
import { resolveModelDriver } from "@/lib/llm/llm/runtime";
import { CompactionEngine } from "@/lib/core/compaction";
import { toChatMessages } from "@/lib/session/derive/chat";
import { executeTool, TOOL_REGISTRY } from "@/lib/tools";
import { randomUUID } from "@/lib/utils/uuid";
import type { ToolEvent } from "@/lib/tools/types";

/** A registry definition that may expose the live concurrency classifier. */
interface ConcurrencyClassifier {
  isConcurrencySafe?(args: unknown): boolean;
}

/** Resolve the active provider name from the same environment contract as the LLM layer. */
function provider(): string {
  return process.env.LLM_PROVIDER ?? process.env.MODEL_PROVIDER ?? "openai";
}

/** Resolve the active model name recorded on the request header. */
function model(): string {
  return getOpenAIModel();
}

/** Resolve the driver for the configured provider (Responses by default). */
function resolveDriver(): ModelDriver {
  return resolveModelDriver();
}

/** Route that streams one durable attachment; blocks take this as `src`. */
function attachmentUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}`;
}

/** Render canonical content blocks as model-visible text. */
function contentText(content: string | readonly ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content.map(blockText).filter(Boolean).join("\n\n");
}

/** Render one content block as text; non-text blocks become short envelopes. */
function blockText(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "reasoning":
    case "tool-call":
      return "";
    // The URL travels with the label so the model can show the file back in a
    // UI block; blocks render `props.src`, never an attachment ref.
    case "image": {
      const label = block.alt ? `Image: ${block.alt}` : "Image";
      return `[${label} — ${attachmentUrl(block.ref.attachmentId)}]`;
    }
    case "video": {
      const label = block.alt ? `Video: ${block.alt}` : "Video";
      return `[${label} — ${attachmentUrl(block.ref.attachmentId)}]`;
    }
    case "file":
      return `[File: ${block.filename ?? "attachment"} — ${attachmentUrl(block.ref.attachmentId)}]`;
    case "block":
      // A submitted block reads as an answer; a live one as a rendered form.
      return block.spec.submitted === true
        ? `[Answered UI Block: ${block.spec.root}]`
        : `[Rendered UI Block: ${block.spec.root}]`;
  }
}

/** Image references a message carries, for the provider adapter to read. */
function imageRefs(
  content: string | readonly ContentBlock[],
): ImageAttachmentRef[] {
  if (typeof content === "string") return [];
  return content.flatMap((block) =>
    block.type === "image" ? [block.ref] : [],
  );
}

/** Project one canonical message onto the provider-neutral driver shape. */
function toModelMessage(message: Message): ModelMessage {
  switch (message.role) {
    case "system":
      return { role: "system", content: contentText(message.content) };
    case "user": {
      const images = imageRefs(message.content);
      return {
        role: "user",
        content: contentText(message.content),
        ...(images.length > 0 ? { images } : {}),
      };
    }
    case "assistant": {
      const text = contentText(message.content);
      const toolCalls: ModelToolCall[] = message.content.flatMap((block) =>
        block.type === "tool-call"
          ? [
              {
                id: String(block.id),
                name: block.name,
                arguments: block.arguments,
              },
            ]
          : [],
      );
      return {
        role: "assistant",
        content: text.length > 0 ? text : null,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
    }
    case "tool": {
      const images = imageRefs(message.content);
      return {
        role: "tool",
        content: contentText(message.content),
        toolCallId: String(message.toolCallId),
        ...(images.length > 0 ? { images } : {}),
      };
    }
  }
}

/** Derive the model-visible conversation from the durable session log. */
function deriveMessages(
  events: readonly SessionEvent[],
  instructions?: string,
): ModelMessage[] {
  // The event shapes are structurally identical; the projection module owns
  // the canonical `SessionEvent` spelling.
  const coreEvents = events as unknown as readonly CoreSessionEvent[];
  return toChatMessages(coreEvents, instructions).map(toModelMessage);
}

/** The dispatcher also accepts underscore names, so mirror its alias lookup. */
function normalizeToolName(name: string): string {
  return name.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

/** Look up a registry definition through the dispatcher's name alias. */
function toolDefinition(name: string): ConcurrencyClassifier | undefined {
  const entry = TOOL_REGISTRY[name] ?? TOOL_REGISTRY[normalizeToolName(name)];
  return entry?.definition as ConcurrencyClassifier | undefined;
}

/** Classify one call; only an exact `true` may run beside its siblings. */
function executionMode(input: ToolExecutionInput): ToolExecutionMode {
  const definition = toolDefinition(input.name);
  const classify = definition?.isConcurrencySafe;
  if (typeof classify !== "function") return { kind: "exclusive" };
  try {
    return classify.call(definition, input.arguments) === true
      ? { kind: "parallel" }
      : { kind: "exclusive" };
  } catch {
    return { kind: "exclusive" };
  }
}

/** Read a legacy tool result as a plain record. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/** Render one legacy `contentParts` entry as text. */
function partText(part: unknown): string {
  if (typeof part === "string") return part;
  const record = asRecord(part);
  if (typeof record.text === "string") return record.text;
  return typeof record.type === "string" ? `[${record.type}]` : "";
}

/** Extract readable text from a legacy `{ contentParts }` payload. */
function payloadText(data: unknown): string {
  const parts = asRecord(data).contentParts;
  if (!Array.isArray(parts)) return "";
  return parts.map(partText).filter(Boolean).join("\n\n");
}

/** Normalize the app dispatcher's result onto the loop's execution contract. */
function normalizeToolOutput(result: unknown): ExecuteToolOutput {
  const record = asRecord(result);
  const success = record.success === true;
  const error = typeof record.error === "string" ? record.error : undefined;
  const data = record.data;
  const text = payloadText(data);

  // The payload keeps its structure; the model-facing text is derived
  // separately so `meta` on the durable event never collapses to a string.
  const modelText =
    text.length > 0
      ? text
      : typeof data === "string" && data.length > 0
        ? data
        : JSON.stringify(
            data ??
              (success
                ? "Tool execution succeeded"
                : (error ?? "Tool execution failed")),
          );

  const content: ContentBlock[] = [{ type: "text", text: modelText }];

  const additionalContexts = Array.isArray(record.additionalContexts)
    ? (record.additionalContexts as ExecuteToolOutput["additionalContexts"])
    : undefined;

  return {
    success,
    data,
    modelText,
    ...(error !== undefined ? { error } : {}),
    content,
    ...(additionalContexts !== undefined && additionalContexts.length > 0
      ? { additionalContexts }
      : {}),
    ...(record.concludesTurn === true ? { concludesTurn: true as const } : {}),
  };
}

/**
 * Run one tool call through the app's central dispatcher.
 *
 * A tool's `ui/block` emission becomes a durable event on the same session log
 * the loop replays, so live and history share one vocabulary.
 */
async function executeHostTool(
  name: string,
  input: ToolExecutionRequest,
): Promise<ExecuteToolOutput> {
  const session = input.agent?.session;
  const emitEvent = session
    ? async (event: ToolEvent): Promise<void> => {
        if (event.type !== "ui/block") return;
        const id = randomUUID();
        // The id is stamped into the spec as well as the event so the client
        // can name the block back when the user answers it.
        session.append("ui/block", { id, spec: { ...event.spec, id } });
      }
    : undefined;

  const result: unknown = await executeTool(name, {
    args: asRecord(input.args),
    context: {
      userId: session?.userId,
      sessionId: session?.id,
      // Tools that point back at their own message (briefs, research) cite this.
      ...(input.turnId !== undefined ? { turnId: input.turnId } : {}),
      ...(emitEvent !== undefined ? { emitEvent } : {}),
    },
  });
  return normalizeToolOutput(result);
}

/** Bind this app's services as the process-wide agent-loop host. */
export function configureDefaultAgentLoop(): void {
  const compaction = new CompactionEngine();
  const host: AgentLoopHost = {
    resolveDriver,
    provider,
    model,
    deriveMessages,
    executionMode,
    executeTool: executeHostTool,
    compaction: () => compaction,
  };
  configureAgentLoop(host);
}
