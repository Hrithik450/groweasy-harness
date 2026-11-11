/**
 * SlotRegistry: the renderer-owned Cordis service over the pure SlotCore
 * (ui-slots owns registration semantics, the declaration ledger, the
 * load-time validations, and the unload cascade). This layer owns what needs
 * a live application: the 'slots/changed' event bridge, registration injection
 * through the caller's ctx.effect (fiber unload collects it), the renderer
 * installation contract (install()/renderSlot('root') + the SlotRendererHost
 * face), and the scope-adapter / root-standard-source rosters.
 */
/* oxlint-disable typescript/no-redundant-type-constituents --
 * `keyof SlotMap & string` is the declare-merge key pattern: SlotMap only
 * holds this package's 'root' row in this compilation unit, but consumers
 * merge keys in; the rule fires on the narrow-map view, not on real
 * redundancy. */
import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import {
  SlotCore,
  standardHookPropName,
} from "@openai-harness/client-ui-slots";
import type {
  HostObservable,
  KeyedStandardSource,
  LiveCompositionNode,
  OwnerOf,
  RootStandardSourceContribution,
  SlotEntryDef,
  SlotMap,
  SlotRenderer,
  SlotRendererHost,
  SlotScope,
  SlotScopeAdapter,
  SlotSpec,
  StandardSourceBinding,
  StoredEntry,
} from "@openai-harness/client-ui-slots";

declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    /**
     * The built-in render-tree root hole (seeded by SlotCore): the one slot
     * the shell itself renders, and the ancestor of every other seat. A
     * product layout entry occupies it once the layout package lands; until
     * then the foundation shell renders an empty root anchor.
     *
     * DO NOT register here outside a product layout: this is a single slot,
     * so a second entry shadows the layout instead of sitting beside it. For
     * a surface that floats over the whole app, declare and use a list slot.
     */
    root: { kind: "single"; scope: "root"; owner: RootOwnerProps };
  }
}

/** Root owner share: the shell supplies nothing — the frame is inject-assembled. */
export interface RootOwnerProps {
  children?: never;
}

/** Type-erased options view the implementation works with (the typed overloads proved the shares). */
interface ErasedRegisterOptions {
  name: string;
  children?: Record<string, SlotSpec<SlotEntryDef>>;
  inject?: (...args: never[]) => Record<string, unknown>;
  key?: string;
  id?: string;
  order?: number;
  label?: string;
  /** Chain-slot routing selector (pure; the core validates presence for chain targets). */
  select?: (owner: never) => unknown;
  /** Chain-slot explicit ordering override (ascending; registration order otherwise). */
  priority?: number;
  registrant?: string;
}

/** Erased core call face (the service re-erases at its own boundary; the core's typed face targets end callers). */
interface ErasedCore {
  register(options: object, component: unknown): () => void;
}

/** One synchronous effect installed while an injected slot declaration is live. */
type SlotInjectionEffect = (() => void) | Iterable<() => void, void, void>;

/** cordis Service layer of the slot system; see the module doc for the split with SlotCore. */
export class SlotRegistry extends Service {
  private readonly _core = new SlotCore();
  private _renderer: SlotRenderer | undefined;
  private _host: SlotRendererHost | undefined;
  private readonly _rootContributions: RootStandardSourceContribution[] = [];
  private readonly _rootListeners = new Set<() => void>();
  private _rootBinding: StandardSourceBinding = {
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  };
  private readonly _rootSource = {
    getSnapshot: (): StandardSourceBinding => this._rootBinding,
    subscribe: (listener: () => void): (() => void) => {
      this._rootListeners.add(listener);
      return () => {
        this._rootListeners.delete(listener);
      };
    },
  };
  private readonly _scopes = new Map<
    Exclude<SlotScope, "root" | "session-maybe">,
    SlotScopeAdapter
  >();
  private _scopeRevision = 0;
  private readonly _scopeListeners = new Set<() => void>();
  private readonly _scopeRevisionSource: HostObservable<number> = {
    getSnapshot: () => this._scopeRevision,
    subscribe: (listener) => {
      this._scopeListeners.add(listener);
      return () => {
        this._scopeListeners.delete(listener);
      };
    },
  };

  /**
   * @param ctx - owning root context.
   */
  constructor(ctx: Context) {
    super(ctx, "slots");
    this._core.onMutate((key) => {
      ctx.emit("slots/changed", key);
    });
  }

  /**
   * The ordinary Slot registration API. The typed face IS the core's register
   * (both overloads reused verbatim — one authority, no structural copy;
   * see SlotCore.register for children declaration, inject face, load-time
   * validation, and the unload cascade). This layer adds disposal through the
   * caller's ctx.effect (fiber unload = cascade) and the registrant
   * diagnostics stamp.
   *
   * Declared here, implemented by prototype assignment below the class: it
   * MUST stay a prototype method (never an instance arrow) — the cordis
   * service proxy binds `this.ctx` to the CALLER's context at call time,
   * which is what routes the effect (and the unload cascade) into the
   * caller's fiber.
   */
  declare readonly register: SlotCore["register"];

  /**
   * Install an effect for each declaration lifetime of a slot. The callback
   * runs synchronously when the declaration already exists; otherwise it runs
   * inside the declaring `register()` call after the declaration is committed.
   * Collapse disposes the effect and a later declaration runs it again.
   * Callback effects are synchronous disposers; iterable effects install
   * transactionally and dispose in reverse order. The controller belongs to
   * the caller's fiber, so plugin unload cancels a pending wait and removes any
   * active contribution.
   *
   * @param key - declared SlotMap key to depend on.
   * @param callback - creates one disposer or an iterable of disposers.
   * @returns idempotent disposer for the wait and active effect.
   * @throws callback setup failures synchronously when the slot is already declared.
   */
  inject(
    key: keyof SlotMap & string,
    callback: () => SlotInjectionEffect,
  ): () => void {
    const ctx = this.ctx;
    const disposeController = ctx.effect(() => {
      let active: (() => void) | undefined;
      let activeEpoch: number | undefined;
      let stopped = false;
      let unsubscribe = (): void => {};

      const stop = (): void => {
        if (stopped) return;
        // Failure callers retire the injection permanently: a delayed setup
        // failure never retries on a later declaration.
        stopped = true;
        unsubscribe();
        const dispose = active;
        active = undefined;
        activeEpoch = undefined;
        dispose?.();
      };

      const reconcile = (): void => {
        if (stopped) return;
        const spec = this._core.specDynamic(key);
        const epoch = this._core.declarationEpoch(key);
        if (active !== undefined && activeEpoch === epoch) return;
        const dispose = active;
        active = undefined;
        activeEpoch = undefined;
        dispose?.();
        if (spec === undefined) return;
        // A declaration lifetime is a nested Cordis effect. This gives
        // generator callbacks the same transactional setup, reverse teardown,
        // diagnostics tree, and idempotence as every other plugin effect.
        const disposeEffect = ctx.effect(
          callback,
          `slots.inject(${JSON.stringify(key)}): declaration`,
        );
        active = () => {
          void disposeEffect();
        };
        activeEpoch = epoch;
      };

      const changed = (): void => {
        try {
          reconcile();
        } catch (error) {
          if (
            (error as { code?: unknown } | null)?.code === "INACTIVE_EFFECT"
          ) {
            stop();
            return;
          }
          stop();
          const failure =
            error instanceof Error ? error : new Error(String(error));
          queueMicrotask(() => {
            throw failure;
          });
        }
      };

      unsubscribe = this._core.subscribeDeclaration(key, changed);
      try {
        reconcile();
      } catch (error) {
        stop();
        throw error;
      }
      return stop;
    }, `slots.inject(${JSON.stringify(key)})`);
    return () => {
      void disposeController();
    };
  }

  /**
   * Install the shell's renderer (ui-renderer's createSlotRenderer product).
   * Boot-once: a second install throws. Runs through the caller's ctx.effect,
   * so shell fiber unload uninstalls the renderer.
   * @param renderer - the outlet machinery implementing SlotRenderer.
   */
  install(renderer: SlotRenderer): void {
    if (this._renderer !== undefined)
      throw new Error("slot renderer already installed (install() is boot-once)");
    this.ctx.effect(() => {
      this._renderer = renderer;
      return () => {
        if (this._renderer === renderer) this._renderer = undefined;
      };
    }, "slots.install()");
  }

  /**
   * Contribute domain-owned root data. Hook names must be globally unique;
   * registration and disposal republish one atomic root binding.
   * @param contribution - bare sources and stable props.
   * @returns disposer owned by the caller's Cordis fiber.
   */
  provideRoot(contribution: RootStandardSourceContribution): () => void {
    const dispose = this.ctx.effect(() => {
      this._rootContributions.push(contribution);
      try {
        this.rebuildRootBinding();
      } catch (error) {
        this._rootContributions.pop();
        throw error;
      }
      return () => {
        const index = this._rootContributions.indexOf(contribution);
        if (index === -1) return;
        this._rootContributions.splice(index, 1);
        this.rebuildRootBinding();
      };
    }, "slots.provideRoot()");
    return () => {
      void dispose();
    };
  }

  /**
   * Install the owner adapter for one strict scope. Its optional counterpart
   * resolves through the same adapter.
   * @param scope - strict scope name.
   * @param adapter - current/resolved binding source and release notifications.
   */
  installScope(
    scope: Exclude<SlotScope, "root" | "session-maybe">,
    adapter: SlotScopeAdapter,
  ): void {
    if (this._scopes.has(scope))
      throw new Error(`slot scope '${scope}' already has an adapter`);
    this.ctx.effect(() => {
      this._scopes.set(scope, adapter);
      this.publishScopeRevision();
      return () => {
        if (this._scopes.get(scope) === adapter) {
          this._scopes.delete(scope);
          this.publishScopeRevision();
        }
      };
    }, `slots.installScope(${JSON.stringify(scope)})`);
  }

  /**
   * The single ctx-level render entry: the shell renders 'root'; every other
   * key renders inside components through the props renderSlot face. The
   * renderer guard is a fail-loud boot-order check.
   *
   * Unlike the reference, an empty root ledger is allowed: the foundation
   * shell has no product layout entry yet and renders the root anchor empty.
   * Once a layout entry exists, a missing registration is the same boot-order
   * failure it is in the reference.
   * @param key - must be 'root' (runtime-enforced for dynamically composed callers).
   * @param owner - owner share for the root entry (the shell supplies {}).
   * @returns the rendered root tree.
   */
  renderSlot<K extends keyof SlotMap & string>(
    key: K,
    owner: OwnerOf<K>,
  ): ReturnType<SlotRenderer["renderRoot"]> {
    // Widened: in this package's own program SlotMap holds only 'root', which
    // would fold the guard to constant-false; the check exists for plain-JS
    // and cross-program callers where K is wider.
    if ((key as string) !== "root") {
      throw new Error(
        `ctx-level renderSlot only renders 'root' (got "${key}"); child slots render through the component props face`,
      );
    }
    if (this._renderer === undefined) {
      throw new Error(
        "slot renderer not installed — boot must call ctx.slots.install(createSlotRenderer()) before rendering 'root'",
      );
    }
    return this._renderer.renderRoot(this.hostFace(), owner);
  }

  /**
   * Snapshot entries for a key (render-erased view; stable reference between mutations).
   * @param key - SlotMap key.
   * @returns registered entries.
   */
  entries(key: keyof SlotMap & string): readonly StoredEntry[] {
    return this._core.entries(key);
  }

  /**
   * Shadowing winners per cell for a key: the first live (non-abdicated)
   * entry of each cell in priority order — what outlets render; chain keys
   * pass through unchanged (election consumes every entry). The raw
   * {@link SlotRegistry.entries} view stays the inspection surface. Fresh
   * array per call, not a uSES getSnapshot source.
   * @param key - SlotMap key.
   * @returns the winning entry per occupied cell.
   */
  entriesOfSlot(key: keyof SlotMap & string): readonly StoredEntry[] {
    return this._core.entriesOfSlot(key);
  }

  /**
   * Export the current JSON-safe Slot declaration trees for read-only inspection.
   * @param root - exact live Slot key; omitted returns all roots.
   * @returns selected composition trees.
   */
  snapshot(root?: string): LiveCompositionNode[] {
    return this._core.snapshot(root);
  }

  /**
   * Observe ordinary entry crashes through one supervision channel. Fires
   * synchronously after any ordinary-entry abdication mutation. Callers own
   * the disposer (wire it through ctx.effect for fiber-lifetime cleanup, as
   * with {@link SlotRegistry.subscribe}).
   * @param fn - called with the Slot key, crashed registration, cause, and
   * whether an ordinary entry was retired.
   * @returns unsubscribe.
   */
  onEntryError(
    fn: (
      key: string,
      registration: StoredEntry,
      error: unknown,
      info: { abdicated: boolean },
    ) => void,
  ): () => void {
    return this._core.onEntryError(fn);
  }

  /**
   * Look up a declared spec (register-declared or the built-in 'root').
   * @param key - SlotMap key.
   * @returns spec or undefined.
   */
  spec<K extends keyof SlotMap & string>(
    key: K,
  ): SlotSpec<SlotMap[K]> | undefined {
    return this._core.spec(key);
  }

  /**
   * Subscribe to a key's registration changes (microtask-batched).
   * @param key - SlotMap key.
   * @param fn - change callback.
   * @returns unsubscribe.
   */
  subscribe(key: keyof SlotMap & string, fn: () => void): () => void {
    return this._core.subscribe(key, fn);
  }

  /**
   * Version counter for uSES pairing.
   * @param key - SlotMap key.
   * @returns current version.
   */
  getVersion(key: keyof SlotMap & string): number {
    return this._core.getVersion(key);
  }

  /** Delegating registration path: registrant stamp + core write. */
  private _register(
    options: ErasedRegisterOptions,
    component: unknown,
  ): () => void {
    const registrant =
      options.registrant ??
      (this.ctx.fiber as { name?: string } | undefined)?.name;
    const erased: ErasedRegisterOptions = {
      ...options,
      ...(registrant !== undefined ? { registrant } : {}),
    };
    // Core write only: all load-time validation (undeclared target,
    // duplicate declaration, kind conflicts) throws there before this layer
    // commits anything.
    return (this._core as ErasedCore).register(erased, component);
  }

  /** Build the domain-neutral host face once; installed adapters remain live through getters. */
  private hostFace(): SlotRendererHost {
    if (this._host !== undefined) return this._host;
    // oxlint-disable-next-line typescript/no-this-alias
    const service = this;
    this._host = {
      subscribe: (key, fn) => this._core.subscribe(key, fn),
      getVersion: (key) => this._core.getVersion(key),
      entriesOf: (key) => this._core.entries(key),
      entriesOfSlot: (key) => this._core.entriesOfSlot(key),
      reportEntryError: (key, entry, error, info) => {
        this._core.reportEntryError(key, entry, error, info);
      },
      specOf: (key) => this._core.specDynamic(key),
      isLive: (entry) => this._core.isLive(entry),
      root: this._rootSource,
      scopeRevision: this._scopeRevisionSource,
      scope: (scope) =>
        service._scopes.get(scope === "session-maybe" ? "session" : scope),
    };
    return this._host;
  }

  /** Validate and atomically publish the current root contribution roster. */
  private rebuildRootBinding(): void {
    const hooks: Record<string, HostObservable<unknown>> = {};
    const keyedHooks: Record<string, KeyedStandardSource> = {};
    const props: Record<string, unknown> = {};
    const finalProps = new Set<string>();
    for (const contribution of this._rootContributions) {
      copyUnique("hook", hooks, contribution.hooks, finalProps, standardHookPropName);
      copyUnique(
        "keyed hook",
        keyedHooks,
        contribution.keyedHooks,
        finalProps,
        standardHookPropName,
      );
      copyUnique("prop", props, contribution.props, finalProps, (name) => name);
    }
    this._rootBinding = { key: undefined, hooks, keyedHooks, props };
    for (const listener of [...this._rootListeners]) {
      try {
        listener();
      } catch (error) {
        console.error("root standard-source subscriber failed:", error);
      }
    }
  }

  /** Publish one installed-scope roster transition after the map is authoritative. */
  private publishScopeRevision(): void {
    this._scopeRevision += 1;
    for (const listener of [...this._scopeListeners]) {
      try {
        listener();
      } catch (error) {
        console.error("scope-adapter subscriber failed:", error);
      }
    }
  }
}

function copyUnique<T>(
  kind: string,
  target: Record<string, T>,
  values: Readonly<Record<string, T>> | undefined,
  finalProps: Set<string>,
  propNameOf: (name: string) => string,
): void {
  if (values === undefined) return;
  for (const [name, value] of Object.entries(values)) {
    const propName = propNameOf(name);
    if (finalProps.has(propName)) {
      throw new Error(`duplicate root standard ${kind} '${name}' at prop '${propName}'`);
    }
    finalProps.add(propName);
    target[name] = value;
  }
}

// register's implementation (prototype assignment pairs with the `declare`
// inside the class — see its JSDoc for why it must live on the prototype).
// Element access reaches the private _register legally and keeps it a
// TS-visible read.
(SlotRegistry.prototype as {
  register: (options: object, component: unknown) => () => void;
}).register = function register(
  this: SlotRegistry,
  rawOptions: object,
  component: unknown,
): () => void {
  // The core's overloads proved the shares; the implementation works on
  // the erased view (same pattern as the core's own implementation arm).
  const options = rawOptions as ErasedRegisterOptions;
  // Bracket reads keep the private/protected access legal outside the class
  // body while preserving the prototype-method `this` binding.
  return this["ctx"].effect(
    () => this["_register"](options, component),
    "slots.register()",
  );
};
