/**
 * Cordis registration for the OpenAI provider route.
 *
 * Mirrors the reference provider packages: one adapter instance owns one
 * provider route, and `registerOpenAIProvider` binds it to a live `ctx.llm`
 * registry. The host keeps storage and SDK construction as injected
 * dependencies instead of importing them here.
 *
 * @module @openai-harness/llm-openai/plugin
 */

import { Context, Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type {} from "@openai-harness/llm";
import {
  OpenAIAdapter,
  type OpenAIDependencies,
} from "./adapter";
import { Config } from "./config";
import {
  resolveOpenAIOptions,
  type OpenAIConfig,
} from "./options";

/** Host wiring for one OpenAI provider route. */
export interface OpenAIProviderOptions extends Omit<OpenAIDependencies, "config"> {
  /** Exact provider route owned by this plugin; defaults to `openai`. */
  provider?: string;
}

/**
 * Register the OpenAI adapter under one provider route.
 * @param ctx - context whose `llm` registry receives the adapter.
 * @param config - plugin config or programmatic overrides.
 * @param options - provider route plus injected image and client seams.
 * @returns the disposer removing the route.
 */
export function registerOpenAIProvider(
  ctx: Context,
  config: OpenAIConfig = {},
  options: OpenAIProviderOptions = {},
): () => void {
  const provider = options.provider ?? "openai";
  const adapter = new OpenAIAdapter({ ...options, config });
  return ctx.llm.registerAdapter(provider, {
    driver: adapter,
    defaultModel: () => resolveOpenAIOptions(config, process.env).model,
  });
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** OpenAI provider plugin instance when mounted. */
    openaiLlm: OpenAIProvider;
  }
}

/** OpenAI provider plugin: registers its adapter while the plugin is mounted. */
export class OpenAIProvider extends Service {
  static Config: z<OpenAIConfig> = Config;

  static inject = ["llm"];

  constructor(
    ctx: Context,
    config: OpenAIConfig = {},
    options: OpenAIProviderOptions = {},
  ) {
    super(ctx, "openaiLlm");
    ctx.effect(
      () => registerOpenAIProvider(ctx, config, options),
      "llm-openai: register provider",
    );
  }
}

export default OpenAIProvider;
