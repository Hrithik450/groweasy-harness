/**
 * Assistant-answer Markdown renderers.
 *
 * The element map is the application's unchanged presentation: same tag
 * choices, same Tailwind classes. Only the import path is packaged.
 *
 * @module @openai-harness/client-ui-chat/client/markdown
 */

import React from "react";

/** Markdown element overrides shared by every assistant text block. */
export const markdownComponents = {
  p: ({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLParagraphElement> & { node?: unknown }) => (
    <div
      {...props}
      className="text-[14.5px] leading-relaxed text-foreground my-2 first:mt-0 last:mb-0 whitespace-pre-line"
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
    if (!href || (!href.startsWith("http://") && !href.startsWith("https://"))) {
      return null;
    }
    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand hover:text-brand-accent underline underline-offset-2 font-medium"
      >
        {children}
      </a>
    );
  },
  h1: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => (
    <h1
      {...props}
      className="font-display text-xl font-bold text-foreground mt-4 mb-2 tracking-tight"
    />
  ),
  h2: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => (
    <h2
      {...props}
      className="font-display text-lg font-bold text-foreground mt-3 mb-1.5 tracking-tight"
    />
  ),
  h3: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) => (
    <h3
      {...props}
      className="font-display text-base font-semibold text-foreground mt-2.5 mb-1"
    />
  ),
  ul: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLUListElement> & { node?: unknown }) => (
    <ul
      {...props}
      className="list-disc list-outside pl-5 my-2 space-y-1 text-[14.5px] text-foreground"
    />
  ),
  ol: ({
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLOListElement> & { node?: unknown }) => (
    <ol
      {...props}
      className="list-decimal list-outside pl-5 my-2 space-y-1 text-[14.5px] text-foreground"
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
      className="border-l-2 border-border-strong pl-4 py-1 italic my-3 text-muted-foreground bg-muted rounded-none whitespace-pre-line"
    />
  ),
  table: ({
    children,
    node: _node,
    ...props
  }: React.TableHTMLAttributes<HTMLTableElement> & { node?: unknown }) => (
    <div className="my-2 w-full overflow-x-auto rounded-none border border-border bg-card">
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
      className="bg-muted border-b border-border text-foreground font-mono font-semibold text-[10.5px] uppercase tracking-[0.14em]"
    >
      {children}
    </thead>
  ),
  tbody: ({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLTableSectionElement> & { node?: unknown }) => (
    <tbody {...props} className="divide-y divide-border">
      {children}
    </tbody>
  ),
  tr: ({
    children,
    node: _node,
    ...props
  }: React.HTMLAttributes<HTMLTableRowElement> & { node?: unknown }) => (
    <tr {...props} className="hover:bg-muted transition-colors">
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
    <div className="relative my-3 rounded-none overflow-hidden border border-brand-border bg-brand-surface text-primary-foreground">
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
        className="px-1.5 py-0.5 rounded-none bg-secondary text-foreground text-[13px] font-mono border border-border"
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
