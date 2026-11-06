/**
 * Cordis registration for the DeepSeek provider route.
 *
 * Mirrors the reference provider packages: one adapter instance owns one
 * provider route, and `registerDeepSeekProvider` binds it to a live `ctx.llm`
 * registry. The host keeps storage and SDK construction as injected
 * dependencies instead of importing them here.
 *
 * @module @openai-harness/llm-deepseek/plugin
 */

import { Context, Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type {} from "@openai-harness/llm";
import { DeepSeekAdapter, type DeepSeekDependencies } from "./adapter";
import {
  Config,
  DEEPSEEK_PROVIDER,
  resolveDeepSeekOptions,
  type DeepSeekConfig,
} from "./config";

/** Host wiring for one DeepSeek provider route. */
export interface DeepSeekProviderOptions
  extends Omit<DeepSeekDependencies, "config"> {
  /** Exact provider route owned by this plugin; defaults to `deepseek`. */
  provider?: string;
}

/**
 * Register the DeepSeek adapter under one provider route.
 * @param ctx - context whose `llm` registry receives the adapter.
 * @param config - plugin config or programmatic overrides.
 * @param options - provider route plus injected image and client seams.
 * @returns the disposer removing the route.
 */
export function registerDeepSeekProvider(
  ctx: Context,
  config: DeepSeekConfig = {},
  options: DeepSeekProviderOptions = {},
): () => void {
  const provider = options.provider ?? DEEPSEEK_PROVIDER;
  const adapter = new DeepSeekAdapter({ ...options, config });
  return ctx.llm.registerAdapter(provider, {
    driver: adapter,
    defaultModel: () => resolveDeepSeekOptions(config, process.env).model,
  });
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** DeepSeek provider plugin instance when mounted. */
    deepseekLlm: DeepSeekProvider;
  }
}

/** DeepSeek provider plugin: registers its adapter while the plugin is mounted. */
export class DeepSeekProvider extends Service {
  static Config: z<DeepSeekConfig> = Config;

  static inject = ["llm"];

  constructor(
    ctx: Context,
    config: DeepSeekConfig = {},
    options: DeepSeekProviderOptions = {},
  ) {
    super(ctx, "deepseekLlm");
    ctx.effect(
      () => registerDeepSeekProvider(ctx, config, options),
      "llm-deepseek: register provider",
    );
  }
}

export default DeepSeekProvider;
