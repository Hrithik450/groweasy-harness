/**
 * Load-time validation for compaction policy and deterministic tool-result
 * pruning budgets.
 *
 * @module @openai-harness/compaction-basic/config
 */

import type {
  BasicCompactionConfig,
  ResolvedCompactionConfig,
  ResolvedToolResultPruneConfig,
  ToolResultPruneConfig,
} from "./types";

/** Low-friction defaults for long coding-agent conversations. */
export const COMPACTION_DEFAULTS = Object.freeze({
  thresholdRatio: 0.8,
  retainRatio: 0.3,
  retainTokens: 20_000,
  contextWindow: 128_000,
  auto: true,
} as const);

/** Marker substituted for every removed tool-result middle span. */
export const PRUNE_MARKER = "\n\n[... tool result middle pruned ...]\n\n";

/** Default character budgets for model-free tool-result pruning. */
export const TOOL_RESULT_PRUNER_DEFAULTS = Object.freeze({
  thresholdChars: 8_000,
  headChars: 2_000,
  tailChars: 2_000,
  keepRecentResults: 2,
} as const);

const COMPACTION_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "thresholdRatio",
  "retainRatio",
  "retainTokens",
  "contextWindow",
  "auto",
  "toolResultPruner",
]);

const PRUNER_CONFIG_KEYS: ReadonlySet<string> = new Set([
  "thresholdChars",
  "headChars",
  "tailChars",
  "keepRecentResults",
]);

/**
 * Count Unicode code points without splitting surrogate pairs.
 * @param text - text to measure.
 * @returns the Unicode code-point count.
 */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * Effective recent-tail budget: at least `retainTokens`, and at least
 * `retainRatio` of the context window.
 * @param config - resolved policy fields that determine retention.
 * @returns the recent-tail token budget kept verbatim.
 */
export function retentionTokens(
  config: Pick<
    ResolvedCompactionConfig,
    "contextWindow" | "retainRatio" | "retainTokens"
  >,
): number {
  return Math.max(
    config.retainTokens,
    Math.floor(config.contextWindow * config.retainRatio),
  );
}

/**
 * Resolve and validate compaction policy, reading `CONTEXT_WINDOW` from the
 * supplied environment when no explicit window is configured.
 *
 * `retainTokens` is an absolute recent-tail floor; `retainRatio` scales with
 * the window. The larger of the two is retained verbatim.
 *
 * @param config - raw policy configuration.
 * @param env - environment source for `CONTEXT_WINDOW`; defaults to empty.
 * @returns a detached frozen configuration.
 * @throws when a value is malformed or a retention/threshold pair is unsafe.
 */
export function resolveCompactionConfig(
  config: BasicCompactionConfig = {},
  env: Readonly<Record<string, string | undefined>> = {},
): ResolvedCompactionConfig {
  assertKnownKeys(config, COMPACTION_CONFIG_KEYS, "BasicCompactionConfig");

  const thresholdRatio = config.thresholdRatio ?? COMPACTION_DEFAULTS.thresholdRatio;
  assertRatio("BasicCompactionConfig.thresholdRatio", thresholdRatio);

  const retainRatio = config.retainRatio ?? COMPACTION_DEFAULTS.retainRatio;
  assertRatio("BasicCompactionConfig.retainRatio", retainRatio);
  if (retainRatio >= thresholdRatio) {
    throw new Error(
      `BasicCompactionConfig: retainRatio (${retainRatio}) must be less than `
        + `thresholdRatio (${thresholdRatio})`,
    );
  }

  const contextWindow =
    config.contextWindow ?? parseContextWindow(env.CONTEXT_WINDOW);
  assertPositiveInteger("BasicCompactionConfig.contextWindow", contextWindow);

  const retainTokens = config.retainTokens ?? COMPACTION_DEFAULTS.retainTokens;
  assertPositiveInteger("BasicCompactionConfig.retainTokens", retainTokens);
  const thresholdTokens = Math.floor(contextWindow * thresholdRatio);
  const effectiveRetainTokens = retentionTokens({
    contextWindow,
    retainRatio,
    retainTokens,
  });
  if (effectiveRetainTokens >= thresholdTokens) {
    throw new Error(
      `BasicCompactionConfig: effective retainTokens (${effectiveRetainTokens}) `
        + `must be less than threshold tokens (${thresholdTokens})`,
    );
  }

  if (config.auto !== undefined && typeof config.auto !== "boolean") {
    throw new Error("BasicCompactionConfig: auto must be a boolean");
  }

  if (config.toolResultPruner !== undefined) {
    resolveToolResultPruneConfig(config.toolResultPruner);
  }

  return Object.freeze({
    thresholdRatio,
    retainRatio,
    retainTokens,
    contextWindow,
    auto: config.auto ?? COMPACTION_DEFAULTS.auto,
  });
}

/**
 * Resolve and validate model-free pruning budgets.
 * @param config - raw pruning configuration.
 * @returns a detached frozen configuration.
 */
export function resolveToolResultPruneConfig(
  config: ToolResultPruneConfig = {},
): ResolvedToolResultPruneConfig {
  assertKnownKeys(config, PRUNER_CONFIG_KEYS, "ToolResultPruneConfig");

  const thresholdChars =
    config.thresholdChars ?? TOOL_RESULT_PRUNER_DEFAULTS.thresholdChars;
  const headChars = config.headChars ?? TOOL_RESULT_PRUNER_DEFAULTS.headChars;
  const tailChars = config.tailChars ?? TOOL_RESULT_PRUNER_DEFAULTS.tailChars;
  const keepRecentResults =
    config.keepRecentResults ?? TOOL_RESULT_PRUNER_DEFAULTS.keepRecentResults;

  assertPositiveInteger("ToolResultPruneConfig.thresholdChars", thresholdChars);
  assertNonNegativeInteger("ToolResultPruneConfig.headChars", headChars);
  assertNonNegativeInteger("ToolResultPruneConfig.tailChars", tailChars);
  assertNonNegativeInteger(
    "ToolResultPruneConfig.keepRecentResults",
    keepRecentResults,
  );

  const emittedChars = headChars + codePointLength(PRUNE_MARKER) + tailChars;
  if (emittedChars > thresholdChars) {
    throw new Error(
      "ToolResultPruneConfig: headChars + marker + tailChars "
        + `(${emittedChars}) must be at most thresholdChars (${thresholdChars})`,
    );
  }

  return Object.freeze({
    thresholdChars,
    headChars,
    tailChars,
    keepRecentResults,
  });
}

/** Parse `CONTEXT_WINDOW`, falling back to the built-in default. */
function parseContextWindow(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return COMPACTION_DEFAULTS.contextWindow;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `BasicCompactionConfig: CONTEXT_WINDOW (${value}) must be a positive integer`,
    );
  }
  return parsed;
}

function assertKnownKeys(
  config: object,
  allowed: ReadonlySet<string>,
  name: string,
): void {
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      throw new Error(`${name}: unknown key "${key}"`);
    }
  }
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} (${String(value)}) must be a positive integer`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} (${String(value)}) must be a non-negative integer`);
  }
}

function assertRatio(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(`${name} (${String(value)}) must be a number in (0, 1]`);
  }
}
