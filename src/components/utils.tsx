import React from "react";
import type { UIBlockSpec } from "@/lib/generative.ui";

interface ParsedMessageAction {
  type: string;
  id: string;
  payload: unknown;
  state?: { values?: Record<string, unknown> };
}

export type MessageSegment =
  | { type: "markdown"; content: string }
  | { type: "ui-block"; spec: UIBlockSpec }
  | { type: "action"; action: ParsedMessageAction };

export function isVideoUrl(url?: string, alt?: string): boolean {
  if (!url) return false;
  const cleanUrl = url.split("?")[0].toLowerCase();

  // Known image file extensions are strictly images, never videos
  if (/\.(png|webp|jpe?g|gif|svg|avif|bmp|ico)$/i.test(cleanUrl)) {
    return false;
  }

  // Known video file extensions
  if (/\.(mp4|webm|mov|m4v|ogg|mkv|avi)$/i.test(cleanUrl)) {
    return true;
  }

  if (alt && /\b(mp4|video|reel|clip)\b/i.test(alt)) {
    return true;
  }

  return false;
}

/**
 * Strips internal/relative markdown links (e.g. [Download PNG](/api/attachments/...) or [Link](/workspace/...))
 * while preserving remote URLs (http:// or https://) and image syntax (![alt](url)).
 * Also cleans up orphaned separator bullets left behind.
 */
export function cleanInternalMarkdownLinks(text: string): string {
  if (!text) return "";
  if (!text.includes("](") || !text.includes(")")) return text;

  // Strip markdown links pointing to internal paths (not starting with http://, https://, or mailto:)
  // Using negative lookbehind (?<!!) ensures image tags ![alt](url) are NEVER stripped.
  const withoutInternalLinks = text.replace(
    /(?<!\!)\[([^\]]+)\]\((?!(?:https?:\/\/|mailto:))[^\)]+\)/gi,
    "",
  );

  if (withoutInternalLinks === text) return text;

  // Clean up any empty lines or standalone separator bullets (like " · " or " | ")
  return withoutInternalLinks
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (/^([·•\s|–—\-])+$/.test(trimmed)) return "";
      return line.replace(/^[\s·•|–—\-]+/, "").replace(/[\s·•|–—\-]+$/, "");
    })
    .filter((line) => line !== "")
    .join("\n\n");
}



export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text) return [];

  const blockRegex = /<(ui-block|ui-action)>\s*([\s\S]*?)\s*<\/\1>/g;
  const segments: MessageSegment[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(text)) !== null) {
    const preText = text.slice(lastIndex, match.index);
    const cleanedPreText = cleanInternalMarkdownLinks(preText);
    if (cleanedPreText.trim()) {
      segments.push({ type: "markdown", content: cleanedPreText });
    }

    try {
      const parsedJson = JSON.parse(match[2]);
      if (parsedJson && typeof parsedJson === "object") {
        if (parsedJson.root && parsedJson.elements) {
          segments.push({
            type: "ui-block",
            spec: parsedJson,
          });
        } else if (parsedJson.type) {
          segments.push({
            type: "action",
            action: {
              type: String(parsedJson.type),
              id: parsedJson.id || `action_${match.index}`,
              payload: parsedJson,
              state:
                parsedJson.state ||
                (parsedJson.values ? { values: parsedJson.values } : undefined),
            },
          });
        } else {
          const rawCleaned = cleanInternalMarkdownLinks(match[0]);
          if (rawCleaned.trim()) {
            segments.push({ type: "markdown", content: rawCleaned });
          }
        }
      }
    } catch {
      // If parsing fails (e.g. malformed JSON), do not dump raw UI tags into markdown text.
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const postText = text.slice(lastIndex);
    // If postText contains an unclosed/streaming <ui-block> or <ui-action>,
    // hold and accumulate it without rendering until it completes.
    const unclosedTagMatch = /<(ui-block|ui-action)(\s|>|$)/i.exec(postText);
    if (unclosedTagMatch) {
      const beforeTag = postText.slice(0, unclosedTagMatch.index);
      const cleanedBefore = cleanInternalMarkdownLinks(beforeTag);
      if (cleanedBefore.trim()) {
        segments.push({ type: "markdown", content: cleanedBefore });
      }
    } else {
      // Check for an incomplete trailing tag like "<", "<ui", "<ui-", "<ui-b"
      const trailingPartial = /<(u(i(-([a-z]*)?)?)?)?$/i.exec(postText);
      const safeText = trailingPartial
        ? postText.slice(0, trailingPartial.index)
        : postText;
      const cleanedPost = cleanInternalMarkdownLinks(safeText);
      if (cleanedPost.trim()) {
        segments.push({ type: "markdown", content: cleanedPost });
      }
    }
  }

  if (segments.length === 0 && text.trim()) {
    const unclosedTagMatch = /<(ui-block|ui-action)(\s|>|$)/i.exec(text);
    const safeText = unclosedTagMatch
      ? text.slice(0, unclosedTagMatch.index)
      : text;
    const cleaned = cleanInternalMarkdownLinks(safeText);
    if (cleaned.trim()) {
      segments.push({ type: "markdown", content: cleaned });
    }
  }

  return segments;
}

const segmentsCache = new Map<string, MessageSegment[]>();
const MAX_CACHE_SIZE = 150;

export function getCachedMessageSegments(text: string): MessageSegment[] {
  if (!text) return [];
  const cached = segmentsCache.get(text);
  if (cached) return cached;

  const result = parseMessageSegments(text);
  if (segmentsCache.size >= MAX_CACHE_SIZE) {
    const firstKey = segmentsCache.keys().next().value;
    if (firstKey) segmentsCache.delete(firstKey);
  }
  segmentsCache.set(text, result);
  return result;
}

export const markdownComponents = {
  // Use div for paragraphs to prevent invalid HTML nesting errors (e.g. <div> or <pre> inside <p>)
  p: ({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLParagraphElement> & { node?: unknown }) => (
    <div
      {...props}
      className="text-[14.5px] leading-relaxed text-foreground/80 my-2 first:mt-0 last:mb-0 whitespace-pre-line"
    >
      {children}
    </div>
  ),
  a: ({
    href,
    children,
    node: _node,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => {
    // In-app destinations stay clickable; outbound links only keep their text.
    const internal =
      typeof href === "string" &&
      (href.startsWith("/") || href.startsWith("#"));

    if (internal) {
      return (
        <a
          {...props}
          href={href}
          className="cursor-pointer text-brand underline underline-offset-2 font-medium hover:opacity-80"
        >
          {children}
        </a>
      );
    }

    void props;
    return (
      <span className="text-brand underline underline-offset-2 font-medium">
        {children}
      </span>
    );
  },
  h1: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => (
    <h1
      {...props}
      className="font-display text-[30px] font-bold leading-[1.1] text-foreground mt-4 mb-2 tracking-tight"
    />
  ),
  h2: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => (
    <h2
      {...props}
      className="font-display text-[27px] font-bold leading-[1.15] text-foreground mt-3 mb-1.5 tracking-tight"
    />
  ),
  h3: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => (
    <h3
      {...props}
      className="font-display text-[24px] font-semibold leading-[1.2] text-foreground mt-2.5 mb-1"
    />
  ),
  ul: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLUListElement> & { node?: unknown }) => (
    <ul
      {...props}
      className="list-disc list-outside pl-5 my-2 space-y-1 text-[14.5px] text-foreground/80"
    />
  ),
  ol: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLOListElement> & { node?: unknown }) => (
    <ol
      {...props}
      className="list-decimal list-outside pl-5 my-2 space-y-1 text-[14.5px] text-foreground/80"
    />
  ),
  li: ({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLLIElement> & { node?: unknown }) => (
    <li {...props} className="leading-relaxed whitespace-pre-line">
      {children}
    </li>
  ),
  strong: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) => (
    <strong {...props} className="font-semibold text-foreground" />
  ),
  blockquote: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLQuoteElement> & { node?: unknown }) => (
    <blockquote
      {...props}
      className="border-l-4 border-success/40 pl-4 py-1 italic my-3 text-muted-foreground bg-muted/50 rounded-r-md whitespace-pre-line"
    />
  ),
  table: ({
    children,
    node: _node,
    ...props
  }: React.TableHTMLAttributes<HTMLTableElement> & { node?: unknown }) => (
    <div className="my-2 w-full overflow-x-auto rounded-lg border border-border bg-card shadow-2xs">
      <table
        {...props}
        className="w-full text-left text-[13.5px] border-collapse"
      >
        {children}
      </table>
    </div>
  ),
  thead: ({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLTableSectionElement> & { node?: unknown }) => (
    <thead
      {...props}
      className="bg-muted/90 border-b border-border text-foreground/80 font-semibold text-[11.5px] uppercase tracking-wider"
    >
      {children}
    </thead>
  ),
  tbody: ({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLTableSectionElement> & { node?: unknown }) => (
    <tbody {...props} className="divide-y divide-border-subtle">
      {children}
    </tbody>
  ),
  tr: ({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLTableRowElement> & { node?: unknown }) => (
    <tr {...props} className="hover:bg-muted/50 transition-colors">
      {children}
    </tr>
  ),
  th: ({
    children,
    node: _node,
    ...props
  }: React.ThHTMLAttributes<HTMLTableCellElement> & { node?: unknown }) => (
    <th
      {...props}
      className="px-3.5 py-1.5 font-semibold text-foreground text-left whitespace-nowrap"
    >
      {children}
    </th>
  ),
  td: ({
    children,
    node: _node,
    ...props
  }: React.TdHTMLAttributes<HTMLTableCellElement> & { node?: unknown }) => (
    <td
      {...props}
      className="px-3.5 py-1.5 text-muted-foreground align-top leading-snug"
    >
      {children}
    </td>
  ),
  pre: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLPreElement> & { node?: unknown }) => (
    <div className="relative my-3 rounded-xl overflow-hidden border border-border bg-foreground text-primary-foreground">
      <pre
        {...props}
        className="p-4 text-xs font-mono overflow-x-auto text-primary-foreground"
      />
    </div>
  ),
  code: ({
    inline,
    className,
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLElement> & {
    inline?: boolean;
    node?: unknown;
  }) => {
    return inline ? (
      <code
        {...props}
        className="px-1.5 py-0.5 rounded bg-muted text-foreground text-[13px] font-mono border border-border/60"
      >
        {children}
      </code>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};
