import type { ContentBlock } from "@openai-harness/llm";

/**
 * Category of a tool call, used by a UI to pick an icon or treatment.
 */
export type ToolCallKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "fetch"
  | "other";

/**
 * A file location a tool reads or modifies.
 */
export interface FileLocation {
  path: string;
  line?: number;
}

/**
 * A single-file change a tool makes.
 */
export interface FileDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

/**
 * Provider-neutral pending-call presentation.
 */
export type ToolCallView = GenericCallView | TerminalCallView | DiffCallView;

/**
 * The default card: a titled tool-call row.
 */
export interface GenericCallView {
  card: "generic";
  title: string;
  kind?: ToolCallKind;
  rawInput?: unknown;
  content?: ContentBlock[];
  locations?: FileLocation[];
}

/**
 * A call that IS a shell command running in a working directory.
 */
export interface TerminalCallView {
  card: "terminal";
  title: string;
  description?: string;
  cwd?: string;
}

/**
 * A call that creates or modifies files.
 */
export interface DiffCallView {
  card: "diff";
  title: string;
  diffs: FileDiff[];
  locations?: FileLocation[];
}

/**
 * One numbered line of a file.
 */
export interface ReadFileLine {
  number: number;
  text: string;
}

/**
 * One matched line inside a search group.
 */
export interface SearchLineMatch {
  lineNumber: number;
  line: string;
}

/**
 * One file's grouped content matches.
 */
export interface SearchFileMatches {
  path: string;
  matches: SearchLineMatch[];
}

export interface SearchMatch {
  path: string;
  line?: number;
  preview?: string;
}

export interface SearchMatchesResultView {
  card: "search";
  shape?: "matches";
  title?: string;
  query?: string;
  files?: SearchFileMatches[];
  matches?: SearchMatch[];
  truncated?: boolean;
  total?: number;
}

export interface SearchPathsResultView {
  card: "search";
  shape: "paths";
  title?: string;
  paths: string[];
  truncated?: boolean;
  total?: number;
}

export type SearchResultView = SearchMatchesResultView | SearchPathsResultView;

export interface ReadResultView {
  card: "read";
  title?: string;
  path: string;
  offset?: number;
  lines?: ReadFileLine[];
  totalLines?: number;
  lang?: string;
  content?: string;
  lineCount?: number;
}

export interface WebSource {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}

export interface WebSearchResultView {
  card: "web";
  kind?: "search";
  title?: string;
  sources: WebSource[];
  answer?: string;
  truncated?: boolean;
}

export interface WebFetchResultView {
  card: "web";
  kind: "fetch";
  title?: string;
  url: string;
  statusCode?: number;
  truncated?: boolean;
}

export type WebResultView = WebSearchResultView | WebFetchResultView;

/**
 * The default completed card: an optional replacement title and reformatted content.
 */
export interface GenericResultView {
  card: "generic";
  title?: string;
  kind?: ToolCallKind;
  content?: ContentBlock[];
  locations?: FileLocation[];
}

/**
 * The completed state of a TerminalCallView.
 */
export interface TerminalResultView {
  card: "terminal";
  title?: string;
  output?: string;
  exitCode?: number;
  signal?: string;
}

/**
 * A completed file mutation rendered as an inline diff card.
 */
export interface DiffResultView {
  card: "diff";
  title?: string;
  diffs: FileDiff[];
  locations?: FileLocation[];
}

/**
 * Provider-neutral completed-call presentation.
 */
export type ToolResultView =
  | GenericResultView
  | TerminalResultView
  | DiffResultView
  | SearchResultView
  | ReadResultView
  | WebResultView;
