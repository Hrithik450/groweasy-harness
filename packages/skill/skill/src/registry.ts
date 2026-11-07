/**
 * Skill provider registry.
 *
 * Provider plugins decide where skills come from; this registry merges provider
 * catalogs, resolves the winning skill for a name, and exposes sorted
 * invocation-neutral summaries plus full definitions on demand.
 *
 * Registrations file into a layer: a scoped registration belongs to one
 * viewing agent, while an unscoped registration is global. A read merges the
 * global layer with the viewing scope's layer, and the scoped layer's entry
 * wins a duplicate name outright. Rank decides duplicates only within one
 * layer; registration order breaks rank ties.
 *
 * @module @openai-harness/skill
 */

import {
  RUNTIME_RANK,
  type SkillCandidate,
  type SkillCatalogSnapshot,
  type SkillDefinition,
  type SkillLookupOptions,
  type SkillProvider,
  type SkillRegistration,
  type SkillSummary,
  type SkillViewOptions,
} from "./types";
import { isSkillName, normalizeSkillName } from "./utils";

const RUNTIME_PROVIDER_NAME = "runtime";

/** Copy the invocation-neutral fields of a definition or candidate. */
export function toSkillSummary(
  skill: SkillDefinition | SkillCandidate,
): SkillSummary {
  const {
    name,
    description,
    whenToUse,
    invocation,
    source,
    provider,
    path: skillPath,
    resourceBase,
  } = skill;
  return {
    name,
    description,
    ...(whenToUse !== undefined ? { whenToUse } : {}),
    invocation,
    source,
    provider,
    ...(skillPath !== undefined ? { path: skillPath } : {}),
    ...(resourceBase !== undefined ? { resourceBase } : {}),
  };
}

/** One provider registration retained by its layer. */
interface RegisteredProvider {
  readonly provider: SkillProvider;
  /** Service-wide monotonic registration order, the within-layer rank tiebreak. */
  readonly order: number;
}

/** One runtime contribution retained by its layer. */
interface RegisteredRuntime {
  readonly definition: SkillDefinition;
  readonly order: number;
}

/** One scope's complete skill-registry contribution. */
class SkillLayer {
  readonly providers = new Map<string, RegisteredProvider>();
  readonly runtime = new Map<string, RegisteredRuntime>();
}

/** A candidate paired with the contribution that produced it. */
type IndexedCandidate =
  | {
      readonly kind: "provider";
      readonly candidate: SkillCandidate;
      readonly provider: SkillProvider;
      readonly order: number;
      readonly localOrder: number;
    }
  | {
      readonly kind: "runtime";
      readonly candidate: SkillCandidate;
      readonly definition: SkillDefinition;
      readonly order: number;
      readonly localOrder: number;
    };

interface LayerCollection {
  readonly entries: IndexedCandidate[];
  readonly complete: boolean;
}

interface RegistryCollection {
  readonly entries: Map<string, IndexedCandidate>;
  readonly complete: boolean;
}

export interface SkillRegistrationOptions {
  /** Registration scope; omitted registers into the global layer. */
  readonly scope?: string;
}

/**
 * Layered registry of skill providers and runtime contributions.
 *
 * A registration files into the layer its caller names: no scope is the global
 * layer, while a non-empty scope is that viewing agent's layer. A read merges
 * the global layer with the exact viewing scope's layer; a scoped entry wins a
 * duplicate name outright and rank decides duplicates within one layer.
 */
export class SkillRegistry {
  private readonly globalLayer = new SkillLayer();
  private readonly scopedLayers = new Map<string, SkillLayer>();
  private nextOrder = 0;

  /**
   * Register a provider into a layer.
   * @param provider - the provider contribution.
   * @param options - registration scope; omitted registers globally.
   * @returns an idempotent disposer that unregisters the provider.
   */
  registerProvider(
    provider: SkillProvider,
    options: SkillRegistrationOptions = {},
  ): () => void {
    if (typeof provider.name !== "string" || provider.name.length === 0) {
      throw new Error("skill provider requires a non-empty name");
    }
    const layer = this.layerFor(options.scope);
    if (layer.providers.has(provider.name)) {
      throw new Error(
        options.scope === undefined
          ? `a skill provider named "${provider.name}" is already registered`
          : `a skill provider named "${provider.name}" is already registered in this scope`,
      );
    }
    layer.providers.set(provider.name, {
      provider,
      order: this.nextOrder++,
    });

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = layer.providers.get(provider.name);
      if (current?.provider === provider) {
        layer.providers.delete(provider.name);
      }
    };
  }

  /**
   * Register a runtime skill contribution into a layer. Runtime entries
   * participate in ranked resolution exactly like provider candidates.
   * @param registration - the skill input; omitted invocation and provider
   *   fields receive defaults.
   * @param options - registration scope; omitted registers globally.
   * @returns an idempotent disposer that unregisters the skill.
   */
  register(
    registration: SkillRegistration,
    options: SkillRegistrationOptions = {},
  ): () => void {
    const name = normalizeSkillName(registration.name);
    if (!isSkillName(name)) {
      throw new Error(`invalid skill name "${registration.name}"`);
    }
    const layer = this.layerFor(options.scope);
    if (layer.runtime.has(name)) {
      console.warn(
        `[SkillRegistry] runtime skill "${name}" ignored because it is already registered`,
      );
      return () => {};
    }
    const definition: SkillDefinition = {
      name,
      description: registration.description,
      ...(registration.whenToUse !== undefined
        ? { whenToUse: registration.whenToUse }
        : {}),
      invocation: {
        modelInvocable: registration.invocation?.modelInvocable ?? true,
        userInvocable: registration.invocation?.userInvocable ?? true,
      },
      source: registration.source ?? "runtime",
      provider: registration.provider ?? RUNTIME_PROVIDER_NAME,
      ...(registration.path !== undefined ? { path: registration.path } : {}),
      ...(registration.resourceBase !== undefined
        ? { resourceBase: registration.resourceBase }
        : {}),
      content: registration.content,
      ...(registration.metadata !== undefined
        ? { metadata: registration.metadata }
        : {}),
    };
    layer.runtime.set(name, { definition, order: this.nextOrder++ });

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      layer.runtime.delete(name);
    };
  }

  /** List invocation-neutral summaries for a workspace and viewing scope. */
  async list(options: SkillViewOptions = {}): Promise<SkillSummary[]> {
    return (await this.snapshot(options)).skills;
  }

  /**
   * Observe the current invocation-neutral catalog and whether every provider
   * completed successfully. A rejecting provider is skipped and marks the
   * observation incomplete; aborting the caller rejects the observation.
   */
  async snapshot(
    options: SkillViewOptions = {},
  ): Promise<SkillCatalogSnapshot> {
    const collected = await this.collect(options);
    return {
      skills: [...collected.entries.values()]
        .map((entry) => toSkillSummary(entry.candidate))
        .sort(compareSkillSummary),
      complete: collected.complete,
    };
  }

  /**
   * Load the winning candidate for a name.
   * @param name - kebab-case skill name.
   * @param options - view options; `scope` selects layers, `cwd` selects
   *   workspace-sensitive skills, and `signal` cancels work.
   * @returns the full skill, including body content, or `undefined`.
   */
  async get(
    name: string,
    options: SkillViewOptions = {},
  ): Promise<SkillDefinition | undefined> {
    if (!isSkillName(name)) return undefined;
    const collected = await this.collect(options);
    options.signal?.throwIfAborted();
    const resolvedName = normalizeSkillName(name);
    const match = collected.entries.get(resolvedName);
    if (match === undefined) return undefined;
    if (match.kind === "runtime") return match.definition;
    const definition = await match.provider.get(resolvedName, options);
    options.signal?.throwIfAborted();
    if (definition === undefined) return undefined;
    if (definition.name !== resolvedName) return undefined;
    return definition;
  }

  private layerFor(scope: string | undefined): SkillLayer {
    if (scope === undefined) return this.globalLayer;
    let layer = this.scopedLayers.get(scope);
    if (layer === undefined) {
      layer = new SkillLayer();
      this.scopedLayers.set(scope, layer);
    }
    return layer;
  }

  private async collect(options: SkillViewOptions): Promise<RegistryCollection> {
    options.signal?.throwIfAborted();
    const globalCollection = await this.collectLayer(
      this.globalLayer,
      options,
    );
    let complete = globalCollection.complete;
    const entries = new Map<string, IndexedCandidate>(
      globalCollection.entries.map((entry) => [entry.candidate.name, entry]),
    );

    if (options.scope !== undefined) {
      const scopedLayer = this.scopedLayers.get(options.scope);
      if (scopedLayer !== undefined) {
        const scopedCollection = await this.collectLayer(
          scopedLayer,
          options,
        );
        if (!scopedCollection.complete) complete = false;
        for (const entry of scopedCollection.entries) {
          entries.set(entry.candidate.name, entry);
        }
      }
    }

    options.signal?.throwIfAborted();
    return { entries, complete };
  }

  private async collectLayer(
    layer: SkillLayer,
    options: SkillLookupOptions,
  ): Promise<LayerCollection> {
    options.signal?.throwIfAborted();
    const candidates: IndexedCandidate[] = [];
    let complete = true;
    let runtimeOrder = 0;

    for (const { definition, order } of layer.runtime.values()) {
      candidates.push({
        kind: "runtime",
        candidate: runtimeCandidate(definition),
        definition,
        order,
        localOrder: runtimeOrder++,
      });
    }

    for (const { provider, order } of layer.providers.values()) {
      options.signal?.throwIfAborted();
      let listed: SkillCandidate[];
      try {
        listed = await provider.list(options);
      } catch (error: unknown) {
        if (options.signal?.aborted === true) {
          throw options.signal.reason ?? error;
        }
        complete = false;
        console.warn(
          `[SkillRegistry] provider "${provider.name}" skipped: ${errorMessage(error)}`,
        );
        continue;
      }
      options.signal?.throwIfAborted();
      let localOrder = 0;
      for (const candidate of listed) {
        validateCandidate(candidate, provider.name);
        candidates.push({
          kind: "provider",
          candidate,
          provider,
          order,
          localOrder: localOrder++,
        });
      }
    }

    candidates.sort(compareIndexedCandidates);
    const seen = new Set<string>();
    const winners: IndexedCandidate[] = [];
    for (const entry of candidates) {
      const name = entry.candidate.name;
      if (seen.has(name)) {
        console.warn(
          `[SkillRegistry] skill "${name}" from ${entry.candidate.source} ignored because a higher-priority skill already exists`,
        );
        continue;
      }
      seen.add(name);
      winners.push(entry);
    }

    return { entries: winners, complete };
  }
}

function runtimeCandidate(skill: SkillDefinition): SkillCandidate {
  return {
    name: skill.name,
    description: skill.description,
    ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
    invocation: skill.invocation,
    source: skill.source,
    provider: skill.provider,
    ...(skill.resourceBase !== undefined
      ? { resourceBase: skill.resourceBase }
      : {}),
    rank: RUNTIME_RANK,
    ...(skill.path !== undefined ? { path: skill.path } : {}),
    ...(skill.metadata !== undefined ? { metadata: skill.metadata } : {}),
  };
}

function validateCandidate(
  candidate: SkillCandidate,
  providerName: string,
): void {
  if (typeof candidate.name !== "string" || !isSkillName(candidate.name)) {
    throw new Error(
      `skill provider "${providerName}" returned invalid skill name "${String(candidate.name)}"`,
    );
  }
  if (typeof candidate.description !== "string") {
    throw new TypeError(
      `skill provider "${providerName}" returned skill "${candidate.name}" with a non-string description`,
    );
  }
  if (
    typeof candidate.rank !== "number" ||
    !Number.isFinite(candidate.rank)
  ) {
    throw new Error(
      `skill provider "${providerName}" returned skill "${candidate.name}" with an invalid rank`,
    );
  }
  if (
    typeof candidate.provider !== "string" ||
    candidate.provider !== providerName
  ) {
    throw new Error(
      `skill provider "${providerName}" returned skill "${candidate.name}" for provider "${String(candidate.provider)}"`,
    );
  }
}

function compareSkillSummary(left: SkillSummary, right: SkillSummary): number {
  return compareCodePoints(left.name, right.name);
}

function compareCodePoints(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareIndexedCandidates(
  left: IndexedCandidate,
  right: IndexedCandidate,
): number {
  return (
    left.candidate.rank - right.candidate.rank ||
    left.order - right.order ||
    left.localOrder - right.localOrder
  );
}

function errorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "[unrenderable thrown value]";
  }
}

