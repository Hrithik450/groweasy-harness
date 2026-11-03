/**
 * On-disk format for the JSONL session provider.
 *
 * Layout (mirrors the reference `session-persistence-jsonl` provider):
 *
 * ```
 * <root>/_no-cwd/<encodeSegment(sessionId)>/session.v1.jsonl
 * ```
 *
 * The first record is always the immutable session header (`type: "session"`).
 * Mutable session metadata (title, slug, hidden, updatedAt) is appended as
 * `type: "session/metadata"` records; the last one wins. Event records are
 * appended after it and carry a dense, contiguous `seq` starting at 0.
 * Metadata records do not consume a sequence number.
 *
 * A session id is an unvalidated branded string, so it is escaped with
 * {@link encodeSegment} before touching the filesystem — no traversal, no
 * collision. A trailing record without a newline is a torn tail: reads ignore
 * it and the next append truncates back to the last complete record.
 *
 * @module @openai-harness/session-persistence-jsonl
 */

import { isAbsolute, join } from "node:path";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionSeq,
  type SessionEvent,
  type SessionHeader,
} from "@openai-harness/session";

/** A session log this build cannot faithfully interpret. */
export class JsonlSessionFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonlSessionFormatError";
  }
}

/** A complete log record violated the append-only format contract. */
export class JsonlSessionCorruptionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JsonlSessionCorruptionError";
  }
}

/** A batch did not contiguously continue the stored event log. */
export class JsonlSessionContiguityError extends Error {
  readonly sessionId: string;
  readonly expectedSeq: number;
  readonly actualSeq: number;
  readonly index: number;

  constructor(
    sessionId: string,
    expectedSeq: number,
    actualSeq: number,
    index: number,
  ) {
    super(
      `Append seq mismatch for session "${sessionId}": expected ${expectedSeq} at batch index ${index}, got ${actualSeq}`,
    );
    this.name = "JsonlSessionContiguityError";
    this.sessionId = sessionId;
    this.expectedSeq = expectedSeq;
    this.actualSeq = actualSeq;
    this.index = index;
  }
}

/** Physical header stored as the first JSONL record. */
export interface HeaderLine {
  type: "session";
  version: number;
  id: string;
  createdAt: number;
  userId?: string;
  isSeeded: boolean;
  delegationDepth: number;
  agentPreset?: string;
}

/** Discriminator of an appended metadata record. Never a SessionEvent type. */
export const SESSION_METADATA_TYPE = "session/metadata";

/** Mutable session metadata appended to the log. */
export interface MetadataLine {
  type: typeof SESSION_METADATA_TYPE;
  title: string;
  slug: string | null;
  hidden: boolean;
  updatedAt: number;
}

/** Metadata folded from the header and every metadata record. */
export interface SessionMetadataState {
  title: string;
  slug: string | null;
  hidden: boolean;
  updatedAt: number;
}

const HEADER_REQUIRED_KEYS = [
  "type",
  "version",
  "id",
  "createdAt",
  "isSeeded",
  "delegationDepth",
] as const;
const HEADER_OPTIONAL_KEYS = ["userId", "agentPreset"] as const;
const HEADER_KEYS = new Set<string>([
  ...HEADER_REQUIRED_KEYS,
  ...HEADER_OPTIONAL_KEYS,
]);

/**
 * Build the physical header record from a logical session header.
 *
 * `isSeeded`/`delegationDepth` are carried as fixed defaults so the physical
 * shape stays compatible with the reference provider's required keys.
 *
 * @param header - the immutable session header.
 * @returns the first JSONL record's object.
 */
export function toHeaderLine(header: SessionHeader): HeaderLine {
  if (
    !Number.isSafeInteger(header.createdAt) ||
    header.createdAt < 0 ||
    Object.is(header.createdAt, -0)
  ) {
    throw new TypeError(
      "session header createdAt must be a non-negative safe integer",
    );
  }
  return {
    type: "session",
    version: header.version,
    id: header.id,
    createdAt: header.createdAt,
    ...(header.userId !== undefined ? { userId: header.userId } : {}),
    isSeeded: false,
    delegationDepth: 0,
    ...(header.agentPreset !== undefined
      ? { agentPreset: header.agentPreset }
      : {}),
  };
}

/**
 * Translate a physical header record into the logical session header.
 * @param line - shape-checked first record.
 * @returns the logical header.
 */
export function fromHeaderLine(line: HeaderLine): SessionHeader {
  return {
    version: SESSION_FORMAT_VERSION,
    id: line.id as SessionId,
    ...(line.userId !== undefined ? { userId: line.userId } : {}),
    createdAt: line.createdAt,
    ...(line.agentPreset !== undefined ? { agentPreset: line.agentPreset } : {}),
  };
}

/** True when a parsed value is a well-formed session header record. */
export function isHeaderLine(value: unknown): value is HeaderLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    !HEADER_REQUIRED_KEYS.every((key) => Object.hasOwn(record, key)) ||
    !Object.keys(record).every((key) => HEADER_KEYS.has(key))
  ) {
    return false;
  }
  return (
    record.type === "session" &&
    typeof record.version === "number" &&
    typeof record.id === "string" &&
    typeof record.createdAt === "number" &&
    Number.isSafeInteger(record.createdAt) &&
    record.createdAt >= 0 &&
    !Object.is(record.createdAt, -0) &&
    typeof record.isSeeded === "boolean" &&
    typeof record.delegationDepth === "number" &&
    Number.isSafeInteger(record.delegationDepth) &&
    record.delegationDepth >= 0 &&
    (record.userId === undefined || typeof record.userId === "string") &&
    (record.agentPreset === undefined ||
      typeof record.agentPreset === "string")
  );
}

/**
 * Build one metadata record.
 * @param metadata - the current metadata values.
 * @returns the JSONL record object.
 */
export function toMetadataLine(
  metadata: SessionMetadataState,
): MetadataLine {
  if (
    !Number.isSafeInteger(metadata.updatedAt) ||
    metadata.updatedAt < 0 ||
    Object.is(metadata.updatedAt, -0)
  ) {
    throw new TypeError(
      "session metadata updatedAt must be a non-negative safe integer",
    );
  }
  return {
    type: SESSION_METADATA_TYPE,
    title: metadata.title,
    slug: metadata.slug,
    hidden: metadata.hidden,
    updatedAt: metadata.updatedAt,
  };
}

/** True when a parsed value is a well-formed metadata record. */
export function isMetadataLine(value: unknown): value is MetadataLine {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.type === SESSION_METADATA_TYPE &&
    typeof record.title === "string" &&
    (record.slug === null || typeof record.slug === "string") &&
    typeof record.hidden === "boolean" &&
    typeof record.updatedAt === "number" &&
    Number.isSafeInteger(record.updatedAt) &&
    record.updatedAt >= 0
  );
}

/**
 * Serialize one event as its JSONL record (no trailing newline).
 * @param event - the event to encode.
 * @returns one physical JSON record.
 */
export function eventLine(event: SessionEvent): string {
  return JSON.stringify(event);
}

/**
 * Serialize a batch as JSONL records separated by newlines (no trailing
 * newline; the writer adds it).
 * @param events - events in log order.
 * @returns the encoded batch.
 */
export function eventLines(events: readonly SessionEvent[]): string {
  return events.map(eventLine).join("\n");
}

/**
 * Encode an arbitrary string as one safe path segment, injectively over all
 * JS (UTF-16) strings. Safe code units stay literal; every other unit,
 * including `~`, becomes `~XXXX`. `.` and `..` are escaped so a whole segment
 * cannot traverse.
 * @param raw - the string to encode; must be non-empty.
 * @returns the escaped single path segment.
 */
export function encodeSegment(raw: string): string {
  if (raw.length === 0) {
    throw new Error("cannot encode an empty path segment");
  }
  if (raw === ".") return "~002E";
  if (raw === "..") return "~002E~002E";
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    const char = String.fromCharCode(code);
    if (char !== "~" && /^[A-Za-z0-9._-]$/.test(char)) {
      out += char;
    } else {
      out += "~" + code.toString(16).toUpperCase().padStart(4, "0");
    }
  }
  return out;
}

/**
 * Build the human-navigable directory key for a project path.
 * @param cwd - absolute project directory.
 * @returns a single filesystem-safe project directory name.
 */
export function projectKey(cwd: string): string {
  if (cwd.length === 0) {
    throw new Error("cannot encode an empty project path");
  }
  let readable = "";
  let separatorRun = false;
  for (let index = 0; index < cwd.length; index += 1) {
    const code = cwd.charCodeAt(index);
    const char = String.fromCharCode(code);
    if (char === "/" || char === "\\" || char === ":") {
      if (!separatorRun) readable += "-";
      separatorRun = true;
    } else if (char !== "~" && /^[A-Za-z0-9._-]$/.test(char)) {
      readable += char;
      separatorRun = false;
    } else {
      readable += "~" + code.toString(16).toUpperCase().padStart(4, "0");
      separatorRun = false;
    }
  }
  const slug = readable.replace(/^-+/, "") || "root";
  return `--${slug.slice(0, 251)}--`;
}

/**
 * Resolve the project directory for a session, `_no-cwd` when it has none.
 * @param root - the provider's session root.
 * @param cwd - optional absolute project directory.
 * @returns the project directory path.
 */
export function projectDir(root: string, cwd?: string): string {
  if (cwd === undefined) return join(root, "_no-cwd");
  if (!isAbsolute(cwd)) {
    throw new Error(`session cwd must be absolute, got "${cwd}"`);
  }
  return join(root, projectKey(cwd));
}

/**
 * Resolve one session's directory.
 * @param root - the provider's session root.
 * @param cwd - optional absolute project directory.
 * @param id - session id, escaped before filesystem use.
 * @returns the session directory path.
 */
export function sessionDir(
  root: string,
  cwd: string | undefined,
  id: SessionId | string,
): string {
  return join(projectDir(root, cwd), encodeSegment(String(id)));
}

/**
 * Canonical filename for a session format generation.
 *
 * Version zero keeps the original suffix-only name; later generations carry a
 * lowercase numeric `vN`. This app writes plaintext only (`.jsonl`), but the
 * `.zstd` suffix is recognized on read so a log written by a compressed peer
 * is refused explicitly rather than misparsed.
 * @param version - non-negative format generation.
 * @returns the filename.
 */
export function generationLogFilename(version: number): string {
  return version === 0 ? "session.jsonl" : `session.v${version}.jsonl`;
}

/**
 * Parse a generation filename.
 * @param filename - one session-directory entry.
 * @returns its format version, or `undefined` when not canonical.
 */
export function parseGenerationLogFilename(
  filename: string,
): number | undefined {
  if (filename === "session.jsonl") return 0;
  const match = /^session\.v([1-9][0-9]*)\.jsonl$/.exec(filename);
  if (match === null) return undefined;
  return Number(match[1]);
}

/**
 * Build one generation's path.
 * @param root - the provider's session root.
 * @param cwd - optional project directory.
 * @param id - session id.
 * @param version - format generation.
 * @returns the log path.
 */
export function generationLogPath(
  root: string,
  cwd: string | undefined,
  id: SessionId | string,
  version: number,
): string {
  return join(sessionDir(root, cwd, id), generationLogFilename(version));
}

/**
 * Build the current generation's path.
 * @param root - the provider's session root.
 * @param cwd - optional project directory.
 * @param id - session id.
 * @returns the current log path.
 */
export function logPath(
  root: string,
  cwd: string | undefined,
  id: SessionId | string,
): string {
  return generationLogPath(root, cwd, id, SESSION_FORMAT_VERSION);
}

/** A complete log scan: header, folded metadata, contiguous events. */
export interface ScannedLog {
  readonly header: SessionHeader;
  readonly metadata: SessionMetadataState;
  readonly events: SessionEvent[];
  readonly nextSeq: number;
  /** Byte offset after the last complete, valid record. */
  readonly committedBytes: number;
}

/**
 * Parse one newline-terminated header record.
 * @param record - header bytes including the trailing newline.
 * @returns the logical header.
 */
function parseHeaderRecord(record: Buffer): SessionHeader {
  if (
    record.length === 0 ||
    record.at(-1) !== 0x0a ||
    record.indexOf(0x0a) !== record.length - 1
  ) {
    throw new JsonlSessionCorruptionError("empty or header-less session log");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.subarray(0, -1).toString("utf8"));
  } catch {
    throw new JsonlSessionCorruptionError(
      "corrupt session log: header line is not valid JSON",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new JsonlSessionCorruptionError(
      "corrupt session log: first line is not a JSON object",
    );
  }
  const version = (parsed as { version?: unknown }).version;
  if (version !== SESSION_FORMAT_VERSION) {
    const id = (parsed as { id?: unknown }).id;
    throw new JsonlSessionFormatError(
      `session "${String(id)}" uses log format v${String(version)}, but this build reads only v${SESSION_FORMAT_VERSION}`,
    );
  }
  if (!isHeaderLine(parsed)) {
    throw new JsonlSessionCorruptionError(
      "corrupt session log: first line is not a session header",
    );
  }
  return fromHeaderLine(parsed);
}

/**
 * Parse one complete event record.
 * @param line - record bytes without a newline.
 * @param lineNumber - 1-based physical line, for diagnostics.
 * @returns the event.
 */
function parseEventLine(line: Buffer, lineNumber: number): SessionEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.toString("utf8"));
  } catch (error) {
    throw new JsonlSessionCorruptionError(
      `corrupt session log: unparsable record at line ${lineNumber}`,
      { cause: error },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new JsonlSessionCorruptionError(
      `corrupt session log: record at line ${lineNumber} is not a JSON object`,
    );
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.type !== "string" ||
    !Number.isSafeInteger(record.seq) ||
    (record.seq as number) < 0 ||
    typeof record.time !== "number" ||
    !("data" in record)
  ) {
    throw new JsonlSessionCorruptionError(
      `corrupt session log: record at line ${lineNumber} is not a session event`,
    );
  }
  return parsed as SessionEvent;
}

/**
 * Scan a complete or torn log buffer.
 *
 * A trailing fragment without a newline is ignored; every complete record must
 * parse, and event records must carry dense, contiguous sequences. Metadata
 * records fold into the returned metadata and do not advance the cursor.
 *
 * @param buffer - raw log bytes, header first.
 * @returns the header, folded metadata, contiguous event prefix, and the byte
 *   offset safe to append at.
 */
export function scanLog(buffer: Buffer): ScannedLog {
  const headerEnd = buffer.indexOf(0x0a);
  if (headerEnd === -1) {
    throw new JsonlSessionCorruptionError("empty or header-less session log");
  }
  const header = parseHeaderRecord(buffer.subarray(0, headerEnd + 1));
  const events: SessionEvent[] = [];
  let metadata: SessionMetadataState = {
    title: "",
    slug: null,
    hidden: false,
    updatedAt: header.createdAt,
  };
  let nextSeq = 0;
  let committedBytes = headerEnd + 1;
  let lineNumber = 1;
  let start = headerEnd + 1;

  for (;;) {
    const newline = buffer.indexOf(0x0a, start);
    if (newline === -1) break;
    lineNumber += 1;
    const line = buffer.subarray(start, newline);
    const end = newline + 1;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line.toString("utf8"));
    } catch (error) {
      throw new JsonlSessionCorruptionError(
        `corrupt session log: unparsable record at line ${lineNumber}`,
        { cause: error },
      );
    }

    if (isMetadataLine(parsed)) {
      metadata = {
        title: parsed.title,
        slug: parsed.slug,
        hidden: parsed.hidden,
        updatedAt: parsed.updatedAt,
      };
    } else {
      const event = parseEventLine(line, lineNumber);
      if (event.seq !== nextSeq) {
        throw new JsonlSessionContiguityError(
          String(header.id),
          nextSeq,
          event.seq,
          0,
        );
      }
      events.push(event);
      nextSeq += 1;
    }

    committedBytes = end;
    start = end;
  }

  return {
    header,
    metadata,
    events,
    nextSeq,
    committedBytes,
  };
}

/**
 * Validate that a batch contiguously continues a stored log.
 * @param sessionId - owning session.
 * @param events - batch in sequence order.
 * @param cursor - stored next sequence.
 */
export function assertContiguous(
  sessionId: string,
  events: readonly SessionEvent[],
  cursor: number,
): void {
  for (const [index, event] of events.entries()) {
    const expected = cursor + index;
    if (event.seq !== expected) {
      throw new JsonlSessionContiguityError(
        sessionId,
        expected,
        event.seq,
        index,
      );
    }
  }
}

/** Re-brand a stored event sequence after parsing. */
export function sealEvent(event: SessionEvent): SessionEvent {
  SessionSeq(event.seq);
  return event;
}
