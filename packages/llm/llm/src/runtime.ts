/**
 * Model-driver registry and the Cordis `llm` runtime service.
 *
 * Provider packages own their wire implementations and call
 * {@link ModelDriverRegistry.register}; this module owns only routing,
 * default-model lookup, and per-variant driver caching. The application keeps
 * its composable root: it registers the providers it ships and reads the
 * environment provider setting through the exported wrappers.
 *
 * @module @openai-harness/llm/runtime
 */

import { Context, Service } from "@deepseek-ai/cordis";
import type { ModelDriver } from "./driver";

/** Provider selected when neither `LLM_PROVIDER` nor `MODEL_PROVIDER` is set. */
export const DEFAULT_MODEL_PROVIDER = "openai";

/** One provider route's driver and default-model resolver. */
export interface ModelDriverRegistration {
  /**
   * Driver instance, or a factory evaluated once per
   * `(provider, variantKey)` pair.
   */
  readonly driver: ModelDriver | (() => ModelDriver);
  /** Current default model id for this provider. */
  readonly defaultModel: () => string;
  /**
   * Distinguishes configuration variants that need separate driver instances
   * (for example an endpoint selection). Omit when one instance serves all
   * configurations.
   */
  readonly variantKey?: () => string;
}

/** Current provider setting before normalization. */
export function currentProviderSetting(): string {
  return (
    process.env.LLM_PROVIDER ??
    process.env.MODEL_PROVIDER ??
    DEFAULT_MODEL_PROVIDER
  );
}

/**
 * Provider-route registry with per-variant driver caching.
 *
 * Registration order is the advertised supported-provider order, which keeps
 * the unknown-provider diagnostic stable.
 */
export class ModelDriverRegistry {
  private readonly registrations = new Map<string, ModelDriverRegistration>();
  private readonly driverCache = new Map<string, ModelDriver>();

  /**
   * Register one provider route.
   * @param provider - route name; matched case-insensitively after trimming.
   * @param registration - driver and default-model resolver.
   * @returns the disposer removing the route and its cached drivers.
   * @throws when the route is empty or already registered.
   */
  register(
    provider: string,
    registration: ModelDriverRegistration,
  ): () => void {
    const name = provider.trim().toLowerCase();
    if (name.length === 0) {
      throw new Error("Model driver provider names must be non-empty.");
    }
    if (this.registrations.has(name)) {
      throw new Error(
        `A model driver for provider "${name}" is already registered.`,
      );
    }
    this.registrations.set(name, registration);
    return () => {
      this.registrations.delete(name);
      this.clearCache(name);
    };
  }

  /**
   * Normalize one provider name.
   * @throws when the name is not registered.
   */
  normalizeProvider(provider: string): string {
    const normalized = provider.trim().toLowerCase();
    if (this.registrations.has(normalized)) return normalized;
    throw new Error(
      `Unknown LLM provider "${normalized}". Supported providers: ${[
        ...this.registrations.keys(),
      ].join(", ")}.`,
    );
  }

  /** Resolve the active provider name. */
  getProviderName(provider?: string): string {
    return this.normalizeProvider(provider ?? currentProviderSetting());
  }

  /**
   * Resolve the driver for a provider, caching one instance per variant.
   * @param provider - provider name; defaults to the environment setting.
   * @throws when the provider is unknown.
   */
  resolve(provider: string = currentProviderSetting()): ModelDriver {
    const name = this.normalizeProvider(provider);
    // `normalizeProvider` guarantees the entry exists.
    const registration = this.registrations.get(name)!;
    const variant = registration.variantKey?.() ?? "";
    const key = variant.length === 0 ? name : `${name}:${variant}`;
    const cached = this.driverCache.get(key);
    if (cached !== undefined) return cached;

    const driver =
      typeof registration.driver === "function"
        ? registration.driver()
        : registration.driver;
    this.driverCache.set(key, driver);
    return driver;
  }

  /** Resolve the default model for a provider. */
  getDefaultModel(provider: string = currentProviderSetting()): string {
    const name = this.normalizeProvider(provider);
    // `normalizeProvider` guarantees the entry exists.
    return this.registrations.get(name)!.defaultModel();
  }

  /** Registered provider names in registration order. */
  listProviders(): string[] {
    return [...this.registrations.keys()];
  }

  /** Drop every cached driver for one provider (all variants). */
  private clearCache(provider: string): void {
    for (const key of this.driverCache.keys()) {
      if (key === provider || key.startsWith(`${provider}:`)) {
        this.driverCache.delete(key);
      }
    }
  }
}

/** Process-wide registry used outside a Cordis composition. */
export const modelDriverRegistry = new ModelDriverRegistry();

/** Register one provider route on the process-wide registry. */
export function registerModelDriver(
  provider: string,
  registration: ModelDriverRegistration,
): () => void {
  return modelDriverRegistry.register(provider, registration);
}

/** Resolve the process-wide active provider name. */
export function getProviderName(provider?: string): string {
  return modelDriverRegistry.getProviderName(provider);
}

/** Resolve the process-wide driver for a provider. */
export function resolveModelDriver(provider?: string): ModelDriver {
  return modelDriverRegistry.resolve(provider);
}

/** Resolve the process-wide default model for a provider. */
export function getDefaultModel(provider?: string): string {
  return modelDriverRegistry.getDefaultModel(provider);
}

/**
 * Cordis `llm` service: a model-driver registry provider plugins register into.
 *
 * The service has no transport or environment coupling; plugins own their
 * configuration and the registry owns selection.
 */
export class LlmRuntime extends Service {
  private readonly registry = new ModelDriverRegistry();

  constructor(ctx: Context, _config: Record<string, never> = {}) {
    super(ctx, "llm");
  }

  /** Register one provider route with this runtime. */
  registerAdapter(
    provider: string,
    registration: ModelDriverRegistration,
  ): () => void {
    return this.registry.register(provider, registration);
  }

  /** Resolve the active provider name. */
  getProviderName(provider?: string): string {
    return this.registry.getProviderName(provider);
  }

  /** Resolve a provider's driver. */
  resolveModelDriver(provider?: string): ModelDriver {
    return this.registry.resolve(provider);
  }

  /** Resolve a provider's default model. */
  getDefaultModel(provider?: string): string {
    return this.registry.getDefaultModel(provider);
  }

  /** Registered provider routes in registration order. */
  listProviders(): string[] {
    return this.registry.listProviders();
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Provider-neutral model-driver registry used by LLM provider plugins. */
    llm: LlmRuntime;
  }
}

export default LlmRuntime;
