"use client";

import { useEffect, useState } from "react";
import remarkGfm from "remark-gfm";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Coins,
  Paperclip,
  StopCircle,
  Wrench,
} from "lucide-react";
import type { ContentBlock } from "@/lib/llm/llm/message";
import type {
  AssistantStepChatNode,
  ChatNode,
  ToolCallChatNode,
  TurnEndChatNode,
  UIBlockChatNode,
  UserChatNode,
} from "./nodes";
import { BlockHost } from "@/components/generative.ui/block.host";
import { UserVideoViewer } from "@/components/video/user.video.viewer";
import { ChatVideoPlayer } from "@/components/video/chat.video.player";
import { UserImageGallery } from "@/components/image/user.image.viewer";
import { markdownComponents } from "@/components/utils";

type ImageBlock = Extract<ContentBlock, { type: "image" }>;
type VideoBlock = Extract<ContentBlock, { type: "video" }>;
type FileBlock = Extract<ContentBlock, { type: "file" }>;
type TextBlock = Extract<ContentBlock, { type: "text" }>;
type UIBlock = Extract<ContentBlock, { type: "block" }>;

/** Attachment route takes the durable id as its path. */
function attachmentSrc(ref: { attachmentId: string }): string {
  return `/api/attachments/${ref.attachmentId}`;
}

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none prose-emerald min-w-0 break-words [overflow-wrap:anywhere] text-foreground dark:text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function UserMarkdown({ text }: { text: string }) {
  return (
    <div className="[&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_p]:whitespace-pre-line [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function FileLink({ block }: { block: FileBlock }) {
  const name = block.filename ?? block.ref.name ?? "Attachment";
  return (
    <a
      href={attachmentSrc(block.ref)}
      download={name}
      className="flex items-center gap-1.5 text-xs text-foreground underline underline-offset-2 break-all"
    >
      <Paperclip className="w-3.5 h-3.5 shrink-0" />
      {name}
    </a>
  );
}

function UserContent({
  node,
  sessionId,
}: {
  node: UserChatNode;
  sessionId: string;
}) {
  const images = node.content.filter(
    (block): block is ImageBlock => block.type === "image",
  );
  const videos = node.content.filter(
    (block): block is VideoBlock => block.type === "video",
  );
  const files = node.content.filter(
    (block): block is FileBlock => block.type === "file",
  );
  const texts = node.content.filter(
    (block): block is TextBlock =>
      block.type === "text" && block.text.length > 0,
  );
  const uiBlocks = node.content.filter(
    (block): block is UIBlock => block.type === "block",
  );

  return (
    <div id={`user-${node.seq}`} className="flex justify-end w-full min-w-0">
      <div className="max-w-[85%] sm:max-w-[75%] min-w-0 flex flex-col items-end gap-2">
        {videos.length > 0 && (
          <div className="flex flex-col items-end gap-2 w-full">
            {videos.map((video, index) => (
              <UserVideoViewer
                key={`user-video-${index}`}
                src={attachmentSrc(video.ref)}
                title={video.alt ?? video.ref.name ?? "Uploaded video"}
              />
            ))}
          </div>
        )}

        {images.length > 0 && (
          <div className="flex justify-end w-full">
            <UserImageGallery
              images={images.map((image) => ({
                src: attachmentSrc(image.ref),
                alt: image.alt ?? "Uploaded image",
              }))}
            />
          </div>
        )}

        {files.length > 0 && (
          <div className="flex flex-col items-end gap-1.5 w-full">
            {files.map((block, index) => (
              <FileLink key={`user-file-${index}`} block={block} />
            ))}
          </div>
        )}

        {texts.length > 0 && (
          <div className="w-fit max-w-full bg-brand text-primary-foreground px-4 py-2.5 rounded-none font-normal text-[14.5px] leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word]">
            {texts.map((block, index) => (
              <UserMarkdown key={`user-text-${index}`} text={block.text} />
            ))}
          </div>
        )}

        {uiBlocks.map((block, index) => (
          <div
            key={`user-block-${index}`}
            className="w-full max-w-full min-w-0"
          >
            <BlockHost
              sessionId={sessionId}
              messageId={String(node.seq)}
              spec={block.spec}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantContent({
  node,
  sessionId,
  isStreaming,
}: {
  node: AssistantStepChatNode;
  sessionId: string;
  isStreaming: boolean;
}) {
  return (
    <>
      {node.content.map((block, index) => {
        switch (block.type) {
          case "text":
            return (
              <AssistantMarkdown key={`text-${index}`} text={block.text} />
            );

          case "block":
            return (
              <div key={`block-${index}`} className="w-full max-w-full min-w-0">
                <BlockHost
                  sessionId={sessionId}
                  messageId={String(node.seq)}
                  spec={block.spec}
                  isStreaming={isStreaming}
                />
              </div>
            );

          case "image":
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`image-${index}`}
                src={attachmentSrc(block.ref)}
                alt={block.alt ?? "Image"}
                className="max-w-full rounded-lg border border-border"
              />
            );

          case "video":
            return (
              <ChatVideoPlayer
                key={`video-${index}`}
                src={attachmentSrc(block.ref)}
                title={block.alt ?? block.ref.name ?? "Generated video"}
              />
            );

          case "file":
            return <FileLink key={`file-${index}`} block={block} />;

          default:
            return null;
        }
      })}
    </>
  );
}

function ToolCallRow({ node }: { node: ToolCallChatNode }) {
  const statusClass =
    node.status === "error"
      ? "text-destructive"
      : node.status === "running"
        ? "text-muted-foreground"
        : "text-success";

  return (
    <div className="flex items-start gap-2 text-[11px] text-muted-foreground min-w-0">
      <Wrench className="w-3 h-3 mt-0.5 shrink-0" />
      <span className="font-mono break-all">{node.name}</span>
      <span className={statusClass}>{node.status}</span>
      {node.durationMs !== undefined && node.durationMs > 0 && (
        <span className="font-mono shrink-0">
          {(node.durationMs / 1000).toFixed(1)}s
        </span>
      )}
      {node.error !== undefined && (
        <span className="text-destructive break-words">{node.error}</span>
      )}
    </div>
  );
}

function TurnEndView({ node }: { node: TurnEndChatNode }) {
  if (node.status === "interrupted") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground dark:text-muted-foreground italic">
        <StopCircle className="w-3.5 h-3.5" />
        <span>Turn was stopped</span>
      </div>
    );
  }

  if (node.error !== undefined) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-none bg-destructive-tint dark:bg-destructive/10 border border-destructive/25 dark:border-destructive/25 text-xs text-destructive dark:text-destructive">
        <AlertTriangle className="w-4 h-4 shrink-0 text-destructive" />
        <span>{node.error || "Turn execution failed"}</span>
      </div>
    );
  }

  if ((node.durationMs ?? 0) <= 0 && node.usage === undefined) return null;

  return (
    <div className="flex items-center justify-between text-[11px] text-muted-foreground dark:text-muted-foreground pt-1 border-t border-border dark:border-foreground">
      <div className="flex items-center gap-3">
        {node.durationMs !== undefined && node.durationMs > 0 && (
          <span className="flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3 text-muted-foreground" />
            {(node.durationMs / 1000).toFixed(1)}s
          </span>
        )}

        {node.usage !== undefined && (
          <span className="flex items-center gap-1 font-mono">
            <Coins className="w-3 h-3 text-muted-foreground" />
            {node.usage.totalTokens} tokens
          </span>
        )}
      </div>
    </div>
  );
}

export interface TurnViewProps {
  turn: number;
  nodes: readonly ChatNode[];
  sessionId: string;
  isStreamingTurn?: boolean;
}

export function TurnView({
  turn,
  nodes,
  sessionId,
  isStreamingTurn = false,
}: TurnViewProps) {
  const turnEnd = nodes.find(
    (node): node is TurnEndChatNode => node.kind === "turn-end",
  );
  const status = turnEnd?.status ?? "running";

  // Collapse the process once the turn settles; the user can reopen it.
  const [isProcessCollapsed, setIsProcessCollapsed] = useState(
    status !== "running",
  );
  useEffect(() => {
    if (status !== "running") setIsProcessCollapsed(true);
  }, [status]);

  const userNodes = nodes.filter(
    (node): node is UserChatNode => node.kind === "user",
  );
  const processNodes = nodes.filter(
    (node): node is ToolCallChatNode | AssistantStepChatNode =>
      node.kind === "tool-call" ||
      (node.kind === "assistant-step" && Boolean(node.reasoning)),
  );
  const answerNodes = nodes.filter(
    (node): node is AssistantStepChatNode =>
      node.kind === "assistant-step" && node.content.length > 0,
  );
  const uiBlocks = nodes.filter(
    (node): node is UIBlockChatNode => node.kind === "ui-block",
  );
  const toolCount = processNodes.filter(
    (node) => node.kind === "tool-call",
  ).length;

  return (
    <div
      id={`turn-${turn}`}
      data-turn={turn}
      className={`flex flex-col gap-3 w-full min-w-0 ${
        isStreamingTurn ? "mb-3" : "mb-6"
      }`}
    >
      {userNodes.map((node) => (
        <UserContent key={node.seq} node={node} sessionId={sessionId} />
      ))}

      {processNodes.length > 0 && (
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => setIsProcessCollapsed((collapsed) => !collapsed)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-fit"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 ease-out ${
                isProcessCollapsed ? "-rotate-90" : "rotate-0"
              }`}
            />
            <span>{isProcessCollapsed ? "Show process" : "Hide process"}</span>
            {toolCount > 0 && (
              <span>
                · {toolCount} tool{toolCount === 1 ? "" : "s"}
              </span>
            )}
          </button>

          {/* Grid-rows animation: 0fr → 1fr gives a smooth height transition
              without measuring the content. */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              isProcessCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
            }`}
          >
            <div className="overflow-hidden min-h-0">
              <div className="flex flex-col gap-2 pl-1 pt-2 border-l border-border">
                {processNodes.map((node) =>
                  node.kind === "tool-call" ? (
                    <ToolCallRow key={`tool-${node.seq}`} node={node} />
                  ) : (
                    <AssistantMarkdown
                      key={`reasoning-${node.seq}`}
                      text={node.reasoning ?? ""}
                    />
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {(answerNodes.length > 0 || uiBlocks.length > 0) && (
        <div className="flex flex-col gap-3 w-full min-w-0">
          {answerNodes.map((node) => (
            <AssistantContent
              key={`answer-${node.seq}`}
              node={node}
              sessionId={sessionId}
              isStreaming={isStreamingTurn}
            />
          ))}

          {uiBlocks.map((node) => (
            <div
              key={`ui-block-${node.seq}`}
              className="w-full max-w-full min-w-0"
            >
              <BlockHost
                spec={node.spec}
                sessionId={sessionId}
                messageId={node.messageId}
                isStreaming={isStreamingTurn}
              />
            </div>
          ))}
        </div>
      )}

      {turnEnd !== undefined && <TurnEndView node={turnEnd} />}
    </div>
  );
}
