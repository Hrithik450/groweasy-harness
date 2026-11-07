/**
 * Cordis `skills` service.
 *
 * The reference harness exposes the provider registry itself as the `skills`
 * service, so bundled provider plugins register with
 * `ctx.skills.registerProvider(...)`. This repository also keeps the plain
 * {@link SkillRegistry} class for non-Cordis hosts (the gateway binds it as a
 * process-wide singleton); the service delegates to one registry instance.
 *
 * @module @openai-harness/skill
 */

import { Service, type Context } from "@deepseek-ai/cordis";
import { SkillRegistry, type SkillRegistrationOptions } from "./registry";
import type {
  SkillCatalogSnapshot,
  SkillDefinition,
  SkillProvider,
  SkillRegistration,
  SkillSummary,
  SkillViewOptions,
} from "./types";

/** Cordis service mounted as `ctx.skills` for bundled and local providers. */
export class SkillService extends Service {
  private readonly registry = new SkillRegistry();

  constructor(ctx: Context, _config: Record<string, never> = {}) {
    super(ctx, "skills");
  }

  /** Register a provider with this service's registry. */
  registerProvider(
    provider: SkillProvider,
    options: SkillRegistrationOptions = {},
  ): () => void {
    return this.registry.registerProvider(provider, options);
  }

  /** Register a runtime skill contribution with this service's registry. */
  register(
    registration: SkillRegistration,
    options: SkillRegistrationOptions = {},
  ): () => void {
    return this.registry.register(registration, options);
  }

  /** List invocation-neutral summaries for one view. */
  list(options: SkillViewOptions = {}): Promise<SkillSummary[]> {
    return this.registry.list(options);
  }

  /** Observe the current catalog and whether every provider completed. */
  snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot> {
    return this.registry.snapshot(options);
  }

  /** Resolve and load the winning skill for a name. */
  get(
    name: string,
    options: SkillViewOptions = {},
  ): Promise<SkillDefinition | undefined> {
    return this.registry.get(name, options);
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Agent skill provider registry mounted by {@link SkillService}. */
    skills: SkillService;
  }
}
