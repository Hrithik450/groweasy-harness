/**
 * Loop hygiene guardrail ported from DeepSeek (@deepseek-ai/dsh-repeat-tool-reminder).
 *
 * Detects when the model repeats identical tool calls with identical arguments.
 * Emits a gentle reminder at threshold[0] (default 3), and detailed diagnostic reminders
 * at later thresholds (default 5, 8).
 *
 * @module @openai-harness/tools/guards/repeat-tool-reminder
 */

export interface RepeatToolReminderConfig {
  /** Consecutive-repeat counts that trigger a reminder (default [3, 5, 8]). */
  thresholds?: number[];
  /** Tool-name patterns to track; empty means every tool is tracked. */
  include?: string[];
  /** Tool-name patterns transparent to the chain (neither count nor reset). */
  exclude?: string[];
  /** Max characters of canonical arguments in detailed reminder (default 500). */
  argumentsPreviewChars?: number;
}

const GENTLE_REMINDER =
  "You are repeating the exact same tool call with identical arguments. " +
  "Carefully analyze the previous result before calling again: if the task is " +
  "not complete, try a different approach or different arguments instead of " +
  "repeating the call.";

function detailedReminder(
  toolName: string,
  count: number,
  canonicalArguments: string,
): string {
  return (
    "Repeated tool call detected:\n" +
    `- tool: ${toolName}\n` +
    `- consecutive_calls: ${count}\n` +
    `- arguments: ${canonicalArguments}\n` +
    "The repeated calls are not making progress. Do not call this tool with " +
    "these exact arguments again. Inspect the latest result and choose a " +
    "different action, different arguments, or finish the task if enough " +
    "evidence has been gathered."
  );
}

/** Deep key-sort so arguments differing only in property ordering match identically. */
export function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortJsonValue(record[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalizeArguments(argumentsValue: unknown): string {
  return JSON.stringify(sortJsonValue(argumentsValue));
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`);
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}

function previewArguments(canonical: string, cap: number): string {
  if (canonical.length <= cap) return canonical;
  return `${canonical.slice(0, cap)}… (+${canonical.length - cap} more chars)`;
}

export interface Chain {
  key: string;
  count: number;
}

export class RepeatToolTracker {
  private readonly thresholds: number[];
  private readonly thresholdSet: Set<number>;
  private readonly includePatterns: RegExp[];
  private readonly excludePatterns: RegExp[];
  private readonly previewChars: number;
  private readonly chains = new Map<string, Chain>();

  constructor(config: RepeatToolReminderConfig = {}) {
    const rawThresholds = config.thresholds ?? [3, 5, 8];
    if (rawThresholds.length === 0) {
      throw new Error("RepeatToolTracker: `thresholds` must not be empty");
    }
    for (const val of rawThresholds) {
      if (!Number.isInteger(val) || val < 2) {
        throw new Error(`RepeatToolTracker: invalid threshold ${val} - must be integer >= 2`);
      }
    }
    this.thresholds = [...new Set(rawThresholds)].sort((a, b) => a - b);
    this.thresholdSet = new Set(this.thresholds);
    this.includePatterns = (config.include ?? []).map(wildcardToRegExp);
    this.excludePatterns = (config.exclude ?? []).map(wildcardToRegExp);
    this.previewChars = config.argumentsPreviewChars ?? 500;
  }

  isTracked(toolName: string): boolean {
    if (this.includePatterns.length > 0 && !this.includePatterns.some((p) => p.test(toolName))) {
      return false;
    }
    return !this.excludePatterns.some((p) => p.test(toolName));
  }

  /**
   * Observe a tool execution. If it hits a repeat threshold, returns the reminder string.
   */
  observe(toolName: string, args: unknown, scopeId: string = "default"): string | undefined {
    if (!this.isTracked(toolName)) return undefined;

    const canonical = canonicalizeArguments(args);
    const key = JSON.stringify([toolName, canonical]);
    const current = this.chains.get(scopeId);

    const count = current && current.key === key ? current.count + 1 : 1;
    this.chains.set(scopeId, { key, count });

    if (!this.thresholdSet.has(count)) return undefined;

    if (count === this.thresholds[0]) {
      return GENTLE_REMINDER;
    }

    return detailedReminder(toolName, count, previewArguments(canonical, this.previewChars));
  }

  reset(scopeId?: string): void {
    if (scopeId) {
      this.chains.delete(scopeId);
    } else {
      this.chains.clear();
    }
  }

  getChain(scopeId: string = "default"): Chain | undefined {
    return this.chains.get(scopeId);
  }
}

export const defaultRepeatToolTracker = new RepeatToolTracker();
