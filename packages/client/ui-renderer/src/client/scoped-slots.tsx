/**
 * React renderer for declarative slots. Per-entry bindings enforce child
 * authorization, and entry boundaries contain registrant failures.
 *
 * Port note: the reference's Store seats, reusable Component Factories, and
 * locale `t` seat are absent here together with their ui-slots counterparts.
 * Everything on the ordinary-slot path — four kinds, three scopes, inject
 * hooks, hookContext, error supervision — is ported 1:1.
 */
import {
  Component,
  useMemo,
  useState,
  useSyncExternalStore,
  type FC,
  type ReactNode,
} from "react";
import {
  SlotOwnershipError,
  StaleAuthorizationError,
  standardHookPropName,
  type ChainRenderOpts,
  type HostObservable,
  type KeyedStandardSource,
  type RenderOpts,
  type ScopedStandardSourceBinding,
  type SessionAreaProps,
  type SessionProviderComponent,
  type SlotEntryDef,
  type SlotRenderer,
  type SlotRendererHost,
  type SlotScope,
  type SlotScopeAdapter,
  type SlotSpec,
  type StandardSourceBinding,
  type StoredEntry,
} from "@openai-harness/client-ui-slots";
import {
  HostContext,
  RootStandardProvider,
  ScopeBindingProvider,
  ScopeProvider,
  keyedObservableHook,
  maybeObservableHook,
  observableHook,
  useHost,
  useRootBinding,
  useScopeBinding,
} from "./bindings";
import { SlotAssemblyError } from "./errors";

type InjectedProps = Record<string, unknown>;
type SlotAnchorTag = "div" | "span";

type SlotHookFactory = (
  standard: InjectedProps,
  hookContext: unknown,
) => unknown;
type SlotHookFactories = Readonly<Record<string, SlotHookFactory>>;

interface BoundSlotInject {
  readonly props: InjectedProps;
  readonly slotHookFactories?: SlotHookFactories | undefined;
}

type RenderSlotBinding = (
  key: string,
  owner: object,
  opts?: RenderOpts,
) => ReactNode;

type RenderSlotChainBinding = (
  key: string,
  owner: object,
  opts?: ChainRenderOpts,
) => ReactNode;

/**
 * Per-entry renderSlot bindings. The binding is identity-stable per entry
 * (memoized components must not resubscribe on unrelated re-renders) and dies
 * with the entry: a retained closure calling after the entry's disposal hits
 * the in-ledger check and throws.
 */
const renderSlotCache = new WeakMap<StoredEntry, RenderSlotBinding>();

function boundRenderSlot(
  host: SlotRendererHost,
  entry: StoredEntry,
): RenderSlotBinding {
  let binding = renderSlotCache.get(entry);
  if (!binding) {
    binding = (key, owner, opts) => {
      if (!host.isLive(entry)) {
        throw new StaleAuthorizationError(
          `renderSlot('${key}') from a disposed registration`,
        );
      }
      // Plain-JS backstop; typed callers are narrowed to the declared keys.
      const declared = entry.children?.[key];
      if (declared === undefined) {
        throw new SlotOwnershipError(
          `slot '${key}' is not declared by this entry's children`,
        );
      }
      if (declared.kind === "chain") {
        throw new SlotOwnershipError(
          `slot '${key}' is declared 'chain' — use renderSlotChain`,
        );
      }
      return (
        <SlotOutlet
          slotKey={key}
          ownerProps={owner}
          opts={opts}
          declaredInline={declared.inline === true}
        />
      );
    };
    renderSlotCache.set(entry, binding);
  }
  return binding;
}

/**
 * Per-entry renderSlotChain bindings: identity-stable per entry (same cache
 * axis as renderSlot — a per-frame dispatch must not rebuild the binding) and
 * dead with the entry. The chain-kind check is the plain-JS backstop twin of
 * the declaration check; typed callers are narrowed to chain keys.
 */
const renderSlotChainCache = new WeakMap<StoredEntry, RenderSlotChainBinding>();

function boundRenderSlotChain(
  host: SlotRendererHost,
  entry: StoredEntry,
): RenderSlotChainBinding {
  let binding = renderSlotChainCache.get(entry);
  if (!binding) {
    binding = (key, owner, opts) => {
      if (!host.isLive(entry)) {
        throw new StaleAuthorizationError(
          `renderSlotChain('${key}') from a disposed registration`,
        );
      }
      const declared = entry.children?.[key];
      if (declared === undefined) {
        throw new SlotOwnershipError(
          `slot '${key}' is not declared by this entry's children`,
        );
      }
      if (declared.kind !== "chain") {
        throw new SlotOwnershipError(
          `slot '${key}' is declared '${declared.kind}', not 'chain' — use renderSlot`,
        );
      }
      return (
        <SlotOutlet
          slotKey={key}
          ownerProps={owner}
          opts={opts}
          declaredInline={declared.inline === true}
        />
      );
    };
    renderSlotChainCache.set(entry, binding);
  }
  return binding;
}

/**
 * Inject results cache: root entries per entry, session entries per
 * (entry x scope binding). WeakMap keys are entry/binding objects (both
 * identity-stable per registration/session scope), so cache lifetime rides
 * the same axes as the values it memoizes.
 */
const rootInjectCache = new WeakMap<StoredEntry, InjectedProps>();
const sessionInjectCache = new WeakMap<
  StoredEntry,
  WeakMap<StandardSourceBinding, InjectedProps>
>();
const sessionMaybeInjectCache = new WeakMap<
  StoredEntry,
  WeakMap<StandardSourceBinding, InjectedProps>
>();

const EMPTY_INJECTED_PROPS: InjectedProps = {};

function runInject(
  entry: Pick<StoredEntry, "inject">,
  binding: StandardSourceBinding | undefined,
): InjectedProps {
  const inject = entry.inject;
  if (!inject) return EMPTY_INJECTED_PROPS;
  // Declaration-derived positional arguments: sessionId for session scope.
  const args: unknown[] = [];
  if (binding !== undefined) args.push(binding.key);
  return bindInjectSources(
    (inject as (...args: unknown[]) => InjectedProps)(...args),
  );
}

/** Bind one entry-owned inject face on its existing cache axis. */
function bindInjectSources(face: InjectedProps): InjectedProps {
  const sources = face["hooks"];
  const keyedSources = face["keyedHooks"];

  if (sources === undefined && keyedSources === undefined) return face;
  const { hooks: _hooks, keyedHooks: _keyedHooks, ...rest } = face;

  const bound: InjectedProps = rest;
  for (const [name, source] of Object.entries(
    (sources ?? {}) as Record<string, HostObservable<unknown>>,
  )) {
    const hookName = standardHookPropName(name);
    bound[hookName] = observableHook(source);
  }

  for (const [name, source] of Object.entries(
    (keyedSources ?? {}) as Record<string, KeyedStandardSource>,
  )) {
    const hookName = standardHookPropName(name);
    bound[hookName] = keyedObservableHook(source);
  }

  return bound;
}

const slotInjectCache = new WeakMap<object, BoundSlotInject>();
const EMPTY_SLOT_INJECT: BoundSlotInject = { props: EMPTY_INJECTED_PROPS };

/** Normalize one dispatcher-owned inject face by its stable object identity. */
function cachedSlotInject(face: object | undefined): BoundSlotInject {
  if (face === undefined) return EMPTY_SLOT_INJECT;
  let bound = slotInjectCache.get(face);
  if (bound !== undefined) return bound;
  const definitions = (face as InjectedProps)["hooks"];
  if (definitions === undefined) {
    bound = { props: face as InjectedProps };
    slotInjectCache.set(face, bound);
    return bound;
  }
  const { hooks: _hooks, ...rest } = face as InjectedProps;
  const props: InjectedProps = rest;
  let factories: Record<string, SlotHookFactory> | undefined;
  for (const [name, definition] of Object.entries(
    definitions as Record<string, unknown>,
  )) {
    const hookName = standardHookPropName(name);
    if (typeof definition === "function") {
      factories ??= {};
      factories[name] = definition as SlotHookFactory;
    } else {
      props[hookName] = observableHook(definition as HostObservable<unknown>);
    }
  }
  bound =
    factories === undefined
      ? { props }
      : { props, slotHookFactories: factories };
  slotInjectCache.set(face, bound);
  return bound;
}

/** Bind deferred slot-level factories for one stable renderSlot occurrence. */
function bindSlotHookFactories(
  factories: SlotHookFactories,
  standard: InjectedProps,
  hookContext: unknown,
): InjectedProps {
  const hooks: InjectedProps = {};
  for (const [name, factory] of Object.entries(factories)) {
    const hookName = standardHookPropName(name);
    hooks[hookName] = factory(standard, hookContext);
  }
  return hooks;
}

function cachedRootInject(entry: StoredEntry): InjectedProps {
  let props = rootInjectCache.get(entry);
  if (!props) {
    props = runInject(entry, undefined);
    rootInjectCache.set(entry, props);
  }
  return props;
}

function cachedSessionInject(
  entry: StoredEntry,
  binding: StandardSourceBinding,
): InjectedProps {
  let perBinding = sessionInjectCache.get(entry);
  if (!perBinding) {
    perBinding = new WeakMap();
    sessionInjectCache.set(entry, perBinding);
  }
  let props = perBinding.get(binding);
  if (!props) {
    props = runInject(entry, binding);
    perBinding.set(binding, props);
  }
  return props;
}

function cachedSessionMaybeInject(
  entry: StoredEntry,
  binding: StandardSourceBinding,
): InjectedProps {
  let perBinding = sessionMaybeInjectCache.get(entry);
  if (!perBinding) {
    perBinding = new WeakMap();
    sessionMaybeInjectCache.set(entry, perBinding);
  }
  let props = perBinding.get(binding);
  if (!props) {
    props = runInject(entry, binding);
    perBinding.set(binding, props);
  }
  return props;
}

/**
 * Entry-identity React keys for entry boundaries. An outlet renders one
 * winner per position (single/keyed/list cell head, chain election) through
 * an error boundary; without a key, a boundary that failed on entry A would
 * survive a winner change (re-election, shadowing fallback after an
 * abdication, HMR re-registration) and keep a healthy entry B blacked out.
 * Keying by entry identity remounts the boundary fresh whenever the winner
 * changes (entries are identity-stable per registration, so the key is
 * stable while the same entry stays the winner).
 */
let nextEntryKey = 0;
const entryKeys = new WeakMap<StoredEntry, number>();

function entryKeyOf(entry: StoredEntry): number {
  let key = entryKeys.get(entry);
  if (key === undefined) {
    key = nextEntryKey++;
    entryKeys.set(entry, key);
  }
  return key;
}

let nextSessionGenerationKey = 0;
const sessionGenerationKeys = new WeakMap<object, number>();

function sessionGenerationKeyOf(binding: ScopedStandardSourceBinding): number {
  let key = sessionGenerationKeys.get(binding.ctx);
  if (key === undefined) {
    key = nextSessionGenerationKey++;
    sessionGenerationKeys.set(binding.ctx, key);
  }
  return key;
}

/**
 * Per-entry isolation: one registrant crashing (component render or inject
 * factory) must not take down siblings. Assembly errors (missing providers)
 * rethrow — a miswired shell must fail loud, not degrade into fallbacks.
 * Every catch reports through `onEntryError` (the ledger's supervision
 * seam); for shadowing kinds the report abdicates the entry, the outlet
 * re-renders onto the cell's next survivor, and this boundary's crash face
 * only shows until that re-render lands (permanently once the cell is dry —
 * the outlet then owns the crash face).
 */
class SlotErrorBoundary extends Component<
  {
    slotKey: string;
    anchor?: SlotAnchorTag;
    onEntryError: (error: unknown) => void;
    children: ReactNode;
  },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(error: unknown): { failed: boolean } {
    if (error instanceof SlotAssemblyError) throw error;
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    console.error(`slot entry crashed in '${this.props.slotKey}':`, error);
    this.props.onEntryError(error);
  }
  override render(): ReactNode {
    const Anchor = this.props.anchor ?? "div";
    if (this.state.failed)
      return <Anchor data-slot-error={this.props.slotKey} />;
    return this.props.children;
  }
}

const rootStandardCache = new WeakMap<StandardSourceBinding, InjectedProps>();
const sessionStandardCache = new WeakMap<
  StandardSourceBinding,
  WeakMap<StandardSourceBinding, InjectedProps>
>();
const sessionMaybeStandardCache = new WeakMap<
  StandardSourceBinding,
  WeakMap<StandardSourceBinding, InjectedProps>
>();

/** Materialize one binding into stable framework Hook and plain-prop seats. */
function materializeStandardBinding(
  binding: StandardSourceBinding,
  optional: boolean,
  defaultKey?: string,
): InjectedProps {
  const standard: InjectedProps = { ...binding.props };
  for (const [name, source] of Object.entries(binding.hooks)) {
    if (source === undefined && !optional) {
      throw new SlotAssemblyError(
        `strict standard hook '${name}' has no source`,
      );
    }
    standard[standardHookPropName(name)] = optional
      ? maybeObservableHook(source)
      : observableHook(source as HostObservable<unknown>);
  }
  for (const [name, source] of Object.entries(binding.keyedHooks)) {
    if (source === undefined && !optional) {
      throw new SlotAssemblyError(
        `strict keyed standard hook '${name}' has no source resolver`,
      );
    }
    standard[standardHookPropName(name)] = keyedObservableHook(
      source,
      defaultKey,
    );
  }
  return standard;
}

/** Stable official-props object used by contextual Hook factories. */
function standardProps(
  scope: SlotScope,
  rootBinding: StandardSourceBinding,
  scopeBinding: StandardSourceBinding | undefined,
): InjectedProps {
  let root = rootStandardCache.get(rootBinding);
  if (root === undefined) {
    root = materializeStandardBinding(rootBinding, false);
    rootStandardCache.set(rootBinding, root);
  }
  if (scope === "root") return root;
  if (scopeBinding === undefined)
    throw new SlotAssemblyError(
      `scope '${scope}' rendered without a standard-source binding`,
    );
  const cache =
    scope === "session" ? sessionStandardCache : sessionMaybeStandardCache;
  let perScope = cache.get(rootBinding);
  if (perScope === undefined) {
    perScope = new WeakMap();
    cache.set(rootBinding, perScope);
  }
  let standard = perScope.get(scopeBinding);
  if (standard !== undefined) return standard;
  standard = {
    ...materializeStandardBinding(rootBinding, false, scopeBinding.key),
    ...materializeStandardBinding(scopeBinding, scope === "session-maybe"),
  };
  perScope.set(scopeBinding, standard);
  return standard;
}

const scopeAreaCache = new WeakMap<
  SlotScopeAdapter,
  SessionProviderComponent
>();

/** Bind one domain-owned scope area renderer to the current scope binding. */
function scopeAreaProvider(
  adapter: SlotScopeAdapter,
): SessionProviderComponent {
  let Provider = scopeAreaCache.get(adapter);
  if (Provider !== undefined) return Provider;
  if (adapter.renderArea === undefined) {
    throw new SlotAssemblyError(
      "scope 'session' adapter does not provide its area renderer",
    );
  }
  const renderArea = adapter.renderArea.bind(adapter);
  Provider = function ScopeAreaProvider(props: SessionAreaProps): ReactNode {
    const inherited = useScopeBinding();
    const explicit = Object.hasOwn(props, "session");
    const source = adapter.bindingSource(props.session);
    const resolved = useSyncExternalStore(
      (listener) => source.subscribe(listener),
      () => source.getSnapshot(),
      () => source.getSnapshot(),
    );
    const binding = explicit ? resolved : inherited;
    return (
      <ScopeBindingProvider binding={binding}>
        {renderArea(binding, props)}
      </ScopeBindingProvider>
    );
  };
  scopeAreaCache.set(adapter, Provider);
  return Provider;
}

/**
 * Standard-kit synthesis: the global standard hooks, the per-scope provide
 * bundle (every `hooks` source becomes a `use<Name>` selector hook and
 * `props` spread verbatim), the renderSlot binding when children are
 * declared, and the SessionProvider seat when the children declare a
 * session-scope slot. Hosts hand out BARE observable sources; every hook is
 * bound HERE, cached per source, so spreading a fresh kit object per render
 * never churns child subscriptions.
 */
function standardKit(
  host: SlotRendererHost,
  entry: StoredEntry,
  scope: SlotScope,
  rootBinding: StandardSourceBinding,
  scopeBinding: StandardSourceBinding | undefined,
): { kit: InjectedProps; standard: InjectedProps } {
  const standard = standardProps(scope, rootBinding, scopeBinding);
  const kit: InjectedProps = { ...standard };
  if (entry.children !== undefined) {
    kit["renderSlot"] = boundRenderSlot(host, entry);
    // renderSlotChain rides the same declaration source: only entries whose
    // children include a chain-kind slot receive the chain dispatch seat.
    if (Object.values(entry.children).some((spec) => spec.kind === "chain")) {
      kit["renderSlotChain"] = boundRenderSlotChain(host, entry);
    }
    // The session owner supplies area semantics; the renderer only binds its
    // adapter to the current generic scope source.
    if (Object.values(entry.children).some((spec) => spec.scope !== "root")) {
      const adapter = host.scope("session");
      if (adapter === undefined) {
        throw new SlotAssemblyError(
          "entry declares a session child without an installed 'session' scope adapter",
        );
      }
      kit["SessionProvider"] = scopeAreaProvider(adapter);
    }
  }
  return { kit, standard };
}

/**
 * One rendered entry: standard kit + cached entry inject + common slot inject
 * + owner props (owner wins). The shares are erased at this render boundary;
 * the registration and renderSlot seams already proved their contracts.
 */
function ContextualEntry({
  slotKey,
  Comp,
  kit,
  standard,
  injected,
  slotInjected,
  ownerProps,
  hookContext,
  hasHookContext,
}: {
  slotKey: string;
  Comp: FC<InjectedProps>;
  kit: InjectedProps;
  standard: InjectedProps;
  injected: InjectedProps;
  slotInjected: BoundSlotInject & {
    readonly slotHookFactories: SlotHookFactories;
  };
  ownerProps: object;
  hookContext: unknown;
  hasHookContext: boolean;
}) {
  const contextual = useMemo(() => {
    if (!hasHookContext) {
      throw new SlotAssemblyError(
        `slot '${slotKey}' has contextual injected Hooks but no hookContext`,
      );
    }
    return bindSlotHookFactories(
      slotInjected.slotHookFactories,
      standard,
      hookContext,
    );
  }, [
    hasHookContext,
    hookContext,
    slotInjected.slotHookFactories,
    slotKey,
    standard,
  ]);
  return (
    <Comp
      {...kit}
      {...injected}
      {...slotInjected.props}
      {...contextual}
      {...ownerProps}
    />
  );
}

function renderEntry(
  slotKey: string,
  Comp: FC<InjectedProps>,
  kit: InjectedProps,
  standard: InjectedProps,
  injected: InjectedProps,
  slotInjected: BoundSlotInject,
  ownerProps: object,
  hookContext: unknown,
  hasHookContext: boolean,
): ReactNode {
  if (slotInjected.slotHookFactories === undefined) {
    return (
      <Comp {...kit} {...injected} {...slotInjected.props} {...ownerProps} />
    );
  }
  return (
    <ContextualEntry
      slotKey={slotKey}
      Comp={Comp}
      kit={kit}
      standard={standard}
      injected={injected}
      slotInjected={
        slotInjected as BoundSlotInject & {
          readonly slotHookFactories: SlotHookFactories;
        }
      }
      ownerProps={ownerProps}
      hookContext={hookContext}
      hasHookContext={hasHookContext}
    />
  );
}

function SessionEntry({
  entry,
  ownerProps,
  binding,
  slotKey,
  slotInjected,
  hookContext,
  hasHookContext,
}: {
  entry: StoredEntry;
  ownerProps: object;
  binding: StandardSourceBinding & { readonly key: string };
  slotKey: string;
  slotInjected: BoundSlotInject;
  hookContext: unknown;
  hasHookContext: boolean;
}) {
  const host = useHost();
  const rootBinding = useRootBinding();
  const Comp = entry.component as FC<InjectedProps>;
  const { kit, standard } = standardKit(
    host,
    entry,
    "session",
    rootBinding,
    binding,
  );
  const injected = cachedSessionInject(entry, binding);
  return renderEntry(
    slotKey,
    Comp,
    kit,
    standard,
    injected,
    slotInjected,
    ownerProps,
    hookContext,
    hasHookContext,
  );
}

function SessionMaybeEntryBody({
  entry,
  ownerProps,
  binding,
  slotKey,
  slotInjected,
  hookContext,
  hasHookContext,
}: {
  entry: StoredEntry;
  ownerProps: object;
  binding: StandardSourceBinding;
  slotKey: string;
  slotInjected: BoundSlotInject;
  hookContext: unknown;
  hasHookContext: boolean;
}) {
  const host = useHost();
  const rootBinding = useRootBinding();
  const Comp = entry.component as FC<InjectedProps>;
  const { kit, standard } = standardKit(
    host,
    entry,
    "session-maybe",
    rootBinding,
    binding,
  );
  const injected = cachedSessionMaybeInject(entry, binding);
  return renderEntry(
    slotKey,
    Comp,
    kit,
    standard,
    injected,
    slotInjected,
    ownerProps,
    hookContext,
    hasHookContext,
  );
}

/**
 * Session-maybe identity: adoption — the ONLY behavior (there is no
 * hold-identity-forever mode). An incarnation born session-less ADOPTS the
 * first session that arrives: identity holds across that one transition
 * (undefined → first id), so a blank shell's DOM survives the moment a
 * session appears. From then on the entry behaves exactly like a strict
 * session entry: switching to a DIFFERENT session remounts (component-local
 * state must not leak between sessions), and dropping back to no-session
 * remounts into a fresh blank incarnation, which will adopt again.
 */
function SessionMaybeEntry({
  entry,
  ownerProps,
  slotKey,
  slotInjected,
  hookContext,
  hasHookContext,
}: {
  entry: StoredEntry;
  ownerProps: object;
  slotKey: string;
  slotInjected: BoundSlotInject;
  hookContext: unknown;
  hasHookContext: boolean;
}) {
  const binding = useScopeBinding();
  const epoch = useMaybeIncarnation(binding);
  return (
    <SessionMaybeEntryBody
      key={epoch}
      entry={entry}
      ownerProps={ownerProps}
      binding={binding}
      slotKey={slotKey}
      slotInjected={slotInjected}
      hookContext={hookContext}
      hasHookContext={hasHookContext}
    />
  );
}

/** Adoption bookkeeping of one session-maybe outlet (see SessionMaybeEntry). */
interface MaybeIncarnation {
  /** Session generation this incarnation adopted; undefined while born blank and unadopted. */
  readonly adopted: object | undefined;
  /** Incarnation counter — the child key; bumps exactly when an incarnation dies. */
  readonly epoch: number;
}

const FIRST_INCARNATION: MaybeIncarnation = { adopted: undefined, epoch: 0 };

function useMaybeIncarnation(binding: StandardSourceBinding): number {
  const identity =
    binding.key === undefined
      ? undefined
      : (binding as ScopedStandardSourceBinding).ctx;
  // The child key is an incarnation counter, NOT the session id: adoption
  // must keep the key constant across undefined → first id. Bookkeeping
  // lives in this stable (unkeyed) wrapper via the render-phase setState
  // form (React's sanctioned derived-state pattern: setState during render
  // of the same component re-renders once before children mount, and the
  // guard conditions make it convergent — StrictMode-safe).
  const [state, setState] = useState<MaybeIncarnation>(FIRST_INCARNATION);
  let { adopted, epoch } = state;
  if (identity !== undefined && adopted === undefined) {
    // Adoption: same epoch — no remount.
    adopted = identity;
    setState({ adopted, epoch });
  } else if (
    adopted !== undefined &&
    identity !== undefined &&
    identity !== adopted
  ) {
    // Post-adoption session switch: next incarnation, born already adopted.
    adopted = identity;
    epoch += 1;
    setState({ adopted, epoch });
  } else if (adopted !== undefined && identity === undefined) {
    // Back to no-session: next incarnation, born blank (adopts anew later).
    adopted = undefined;
    epoch += 1;
    setState({ adopted, epoch });
  }
  return epoch;
}

function RootEntry({
  entry,
  ownerProps,
  slotKey,
  slotInjected,
  hookContext,
  hasHookContext,
}: {
  entry: StoredEntry;
  ownerProps: object;
  slotKey: string;
  slotInjected: BoundSlotInject;
  hookContext: unknown;
  hasHookContext: boolean;
}) {
  const host = useHost();
  const rootBinding = useRootBinding();
  const Comp = entry.component as FC<InjectedProps>;
  const { kit, standard } = standardKit(
    host,
    entry,
    "root",
    rootBinding,
    undefined,
  );
  const injected = cachedRootInject(entry);
  return renderEntry(
    slotKey,
    Comp,
    kit,
    standard,
    injected,
    slotInjected,
    ownerProps,
    hookContext,
    hasHookContext,
  );
}

function StrictSessionEntry({
  slotKey,
  anchor,
  entry,
  ownerProps,
  slotInjected,
  hookContext,
  hasHookContext,
  onEntryError,
}: {
  slotKey: string;
  anchor: SlotAnchorTag;
  entry: StoredEntry;
  ownerProps: object;
  slotInjected: BoundSlotInject;
  hookContext: unknown;
  hasHookContext: boolean;
  onEntryError: (error: unknown) => void;
}) {
  const binding = useScopeBinding();
  if (binding.key === undefined) {
    throw new SlotAssemblyError(
      `strict session slot '${slotKey}' rendered without a scope binding`,
    );
  }
  const scopedBinding = binding as ScopedStandardSourceBinding;
  // Per-session remount rides this key; per-entry remount rides the outer
  // element's entry-identity key (the outlet's guarded() call).
  return (
    <SlotErrorBoundary
      slotKey={slotKey}
      anchor={anchor}
      key={sessionGenerationKeyOf(scopedBinding)}
      onEntryError={onEntryError}
    >
      <SessionEntry
        entry={entry}
        ownerProps={ownerProps}
        binding={scopedBinding}
        slotKey={slotKey}
        slotInjected={slotInjected}
        hookContext={hookContext}
        hasHookContext={hasHookContext}
      />
    </SlotErrorBoundary>
  );
}

/**
 * Anchor style shared by every outlet wrapper: `display:contents` keeps the
 * wrapper out of layout (grid/flex parents see the slot's own children), so
 * the anchor is purely addressable surface. Module-level constant — a stable
 * reference so the wrapper never diffs its style prop.
 */
const ANCHOR_STYLE = { display: "contents" } as const;

function SlotOutlet({
  slotKey,
  ownerProps,
  opts,
  declaredInline,
}: {
  slotKey: string;
  ownerProps: object;
  opts?: (RenderOpts & ChainRenderOpts) | undefined;
  declaredInline: boolean;
}) {
  const host = useHost();
  // Version tick drives entries() re-read; the host batches per microtask.
  useSyncExternalStore(
    (fn) => host.subscribe(slotKey, fn),
    () => host.getVersion(slotKey),
  );
  const scopeBinding = useScopeBinding();
  const spec = host.specOf(slotKey);
  // Retained elements keep their declaration's anchor after unload, but never
  // use that declaration to dispatch entries while the live spec is absent.
  const Anchor = (spec === undefined ? declaredInline : spec.inline === true)
    ? "span"
    : "div";
  // Anchor contract: every slot render site exposes a stable
  // `[data-slot="<key>"]` wrapper — the addressable seam dynamic styles
  // target — and `display:contents` keeps it layout-neutral. The wrapper
  // rides the outlet, not the dispatch outcome: fallback, crash-face, and
  // undeclared-empty states all render inside it, so the anchor's presence
  // never flickers with registration churn.
  return (
    <Anchor data-slot={slotKey} style={ANCHOR_STYLE}>
      {spec === undefined
        ? null
        : renderOutletContent(
            host,
            slotKey,
            ownerProps,
            opts,
            scopeBinding,
            spec,
          )}
    </Anchor>
  );
}

/** Kind dispatch behind the outlet anchor (single/keyed/list/chain, fallbacks, crash faces). */
function renderOutletContent(
  host: SlotRendererHost,
  slotKey: string,
  ownerProps: object,
  opts: (RenderOpts & ChainRenderOpts) | undefined,
  scopeBinding: StandardSourceBinding,
  spec: SlotSpec<SlotEntryDef>,
): ReactNode {
  const Anchor = spec.inline === true ? "span" : "div";
  if (spec.kind === "chain" && opts?.fallbackOnly === true) {
    return renderChainResult(slotKey, null, opts, Anchor);
  }
  if (spec.scope === "session" && scopeBinding.key === undefined) {
    throw new SlotAssemblyError(
      `strict session slot '${slotKey}' rendered without a scope binding`,
    );
  }
  const entries = host.entriesOf(slotKey);
  const slotInjected = cachedSlotInject(spec.inject);

  // The boundary must wrap the Entry ELEMENT, not live inside it: inject
  // factories and kit synthesis run in the Entry body and must land in the
  // per-entry fallback rather than escaping to the tree above.
  const guarded = (
    entry: StoredEntry,
    key?: string | number,
    owner: object = ownerProps,
  ) => {
    const hasHookContext =
      opts !== undefined && Object.hasOwn(opts, "hookContext");
    const hookContext = opts?.hookContext;
    // Shadowing kinds abdicate on crash (the cell falls to its next
    // survivor); chain reports without abdicating — election alternatives
    // resolve at select time, and retiring a crashed elected entry would
    // change the static crash face.
    const onEntryError = (error: unknown) => {
      host.reportEntryError(slotKey, entry, error, {
        abdicate: spec.kind !== "chain",
      });
    };
    return spec.scope === "session" ? (
      <StrictSessionEntry
        slotKey={slotKey}
        anchor={Anchor}
        entry={entry}
        ownerProps={owner}
        slotInjected={slotInjected}
        hookContext={hookContext}
        hasHookContext={hasHookContext}
        onEntryError={onEntryError}
        key={key}
      />
    ) : (
      <SlotErrorBoundary
        slotKey={slotKey}
        anchor={Anchor}
        key={key}
        onEntryError={onEntryError}
      >
        {spec.scope === "session-maybe" ? (
          <SessionMaybeEntry
            entry={entry}
            ownerProps={owner}
            slotKey={slotKey}
            slotInjected={slotInjected}
            hookContext={hookContext}
            hasHookContext={hasHookContext}
          />
        ) : (
          <RootEntry
            entry={entry}
            ownerProps={owner}
            slotKey={slotKey}
            slotInjected={slotInjected}
            hookContext={hookContext}
            hasHookContext={hasHookContext}
          />
        )}
      </SlotErrorBoundary>
    );
  };
  // A cell whose every registration abdicated keeps the crash face: the
  // shadowing collapse ran out of survivors, which is a failure state, not
  // the owner's natural-empty fallback.
  const deadCell = () => <Anchor data-slot-error={slotKey} />;

  if (spec.kind === "single") {
    const entry = host.entriesOfSlot(slotKey)[0];
    if (!entry)
      return entries.length > 0 ? deadCell() : <>{opts?.fallback ?? null}</>;
    return guarded(entry, entryKeyOf(entry));
  }
  if (spec.kind === "keyed") {
    const entry = host
      .entriesOfSlot(slotKey)
      .find((e) => e.options.key === opts?.entryKey);
    if (!entry) {
      const occupied = entries.some((e) => e.options.key === opts?.entryKey);
      return occupied ? deadCell() : <>{opts?.fallback ?? null}</>;
    }
    return guarded(entry, entryKeyOf(entry));
  }
  if (spec.kind === "chain") {
    // Entries arrive priority-sorted from the ledger (the core orders at
    // register, ties keep registration sequence). Selectors are pure
    // functions of the owner props (register-face contract), so the routing
    // pass runs per render with zero mount side effects: the first non-null
    // election renders, decliners never mount.
    let elected: ReactNode = null;
    for (const entry of entries) {
      let matched: unknown;
      try {
        // Chain entries always carry select (SlotCore register validation).
        matched = (entry.select as (owner: object) => unknown)(ownerProps);
      } catch (error) {
        // A throwing selector is a registrant contract breach (select MUST be
        // pure and total), but it runs before the entry's SlotErrorBoundary
        // exists — uncontained it would black out the whole owner region. So
        // it degrades to a decline: the chain and the fallback stay intact,
        // and the breach is reported like a crashed entry.
        console.error(
          `chain selector crashed in '${slotKey}' (${entry.registrant ?? "unknown registrant"}), treating as declined:`,
          error,
        );
        continue;
      }
      if (matched !== null) {
        elected = guarded(entry, entryKeyOf(entry), { ...ownerProps, matched });
        break;
      }
    }
    return renderChainResult(slotKey, elected, opts, Anchor);
  }
  // list: one row per id cell — the cell's shadowing winner, or the crash
  // face once every entry of the cell abdicated (a dry cell must not
  // silently drop its row). Row sequence: registration order refined by
  // explicit order, optional id filter, as before shadowing existed.
  const winners = host.entriesOfSlot(slotKey);
  const rows: {
    entry: StoredEntry | undefined;
    id: string | undefined;
    order: number;
  }[] = winners.map((entry) => ({
    entry,
    id: entry.options.id,
    order: entry.options.order ?? 0,
  }));
  const rowIds = new Set(rows.map((row) => row.id));
  for (const entry of entries) {
    if (rowIds.has(entry.options.id)) continue;
    rowIds.add(entry.options.id);
    // Dry cells anchor their row at the cell head's declared order.
    rows.push({
      entry: undefined,
      id: entry.options.id,
      order: entry.options.order ?? 0,
    });
  }
  let list = [...rows].sort((a, b) => a.order - b.order);
  if (opts?.only !== undefined)
    list = list.filter((item) => item.id === opts.only);
  if (list.length === 0) return <>{opts?.fallback ?? null}</>;
  // Winner rows key by entry identity (see entryKeyOf); dry-cell rows key by
  // id — the disjoint prefixes keep the two namespaces from colliding.
  return (
    <>
      {list.map((item, i) =>
        item.entry !== undefined ? (
          guarded(item.entry, `e${entryKeyOf(item.entry)}`)
        ) : (
          <Anchor data-slot-error={slotKey} key={`x${item.id ?? i}`} />
        ),
      )}
    </>
  );
}

/** Render a chain election while preserving the overlay fallback's tree position. */
function renderChainResult(
  slotKey: string,
  elected: ReactNode,
  opts: (RenderOpts & ChainRenderOpts) | undefined,
  Anchor: SlotAnchorTag,
): ReactNode {
  if (!opts?.overlay) return elected ?? <>{opts?.fallback ?? null}</>;
  return (
    <>
      <Anchor
        data-chain-overlay-fallback={slotKey}
        style={{ display: elected === null ? "contents" : "none" }}
      >
        {opts.fallback ?? null}
      </Anchor>
      {elected}
    </>
  );
}

/**
 * Root outlet: the shell's single ctx-level render entry.
 *
 * Foundation divergence: the reference throws when no layout entry has
 * registered into `root`. This shell has no product layout yet, so the root
 * anchor renders empty; a registered-but-fully-abdicated root still shows the
 * crash face.
 */
function RootOutlet({ ownerProps }: { ownerProps: object }) {
  const host = useHost();
  useSyncExternalStore(
    (fn) => host.subscribe("root", fn),
    () => host.getVersion("root"),
  );
  const entry = host.entriesOfSlot("root")[0];
  if (!entry) {
    if (host.entriesOf("root").length > 0)
      return <div data-slot-error="root" />;
    return <div data-slot="root" style={ANCHOR_STYLE} />;
  }
  // Same anchor contract as SlotOutlet: 'root' is a slot like any other, and
  // display:contents keeps the wrapper out of the shell's layout.
  return (
    <div data-slot="root" style={ANCHOR_STYLE}>
      <SlotErrorBoundary
        slotKey="root"
        key={entryKeyOf(entry)}
        onEntryError={(error) => {
          host.reportEntryError("root", entry, error, { abdicate: true });
        }}
      >
        <RootEntry
          entry={entry}
          ownerProps={ownerProps}
          slotKey="root"
          slotInjected={EMPTY_SLOT_INJECT}
          hookContext={undefined}
          hasHookContext={false}
        />
      </SlotErrorBoundary>
    </div>
  );
}

/**
 * Build the renderer installed into the `ui-renderer` SlotRegistry
 * (ctx.slots.install(createSlotRenderer()) at boot; the service owns the
 * install/renderSlot contract and the double-install/not-installed throws).
 * @returns the renderer.
 */
export function createSlotRenderer(): SlotRenderer {
  return {
    renderRoot(host, ownerProps) {
      return (
        <HostContext.Provider value={host}>
          <RootStandardProvider>
            <ScopeProvider scope="session-maybe">
              <RootOutlet ownerProps={ownerProps} />
            </ScopeProvider>
          </RootStandardProvider>
        </HostContext.Provider>
      );
    },
  };
}
