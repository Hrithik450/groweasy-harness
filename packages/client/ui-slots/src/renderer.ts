/** React-free contracts between the slot host and an installed renderer. */
import type { Context } from "@deepseek-ai/cordis";
import type { ReactNode } from "react";
import type {
  SessionAreaProps,
  SlotEntryDef,
  SlotScope,
  SlotSpec,
  StoredEntry,
} from "./index";

/** Observable currency shared by domain sources, scopes, and the renderer. */
export interface HostObservable<T> {
  /** @returns the current immutable snapshot. */
  getSnapshot(): T;
  /**
   * Subscribe to snapshot changes.
   * @param listener - change callback.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void;
}

/** Typed selector hook over a {@link HostObservable}. */
export interface SnapshotSelectorHook<Snapshot> {
  /**
   * @param selector - projection over the current snapshot.
   * @param equal - optional selected-value equality.
   * @returns the selected value.
   */
  <Selected>(
    selector: (snapshot: Snapshot) => Selected,
    equal?: (left: Selected, right: Selected) => boolean,
  ): Selected;
}

/** Selector hook over a source that may be absent (optional scopes). */
export interface MaybeSnapshotSelectorHook<Snapshot> {
  /**
   * @param selector - projection over the current snapshot, or undefined while absent.
   * @param equal - optional selected-value equality.
   * @returns the selected value, or undefined while the source is absent.
   */
  <Selected>(
    selector: (snapshot: Snapshot) => Selected,
    equal?: (left: Selected, right: Selected) => boolean,
  ): Selected | undefined;
}

/**
 * Convert one standard source name to its rendered Hook prop name.
 * @param name - registered fixed or keyed source name.
 * @returns the `use<Name>` prop exposed to Slot components.
 */
export function standardHookPropName(name: string): string {
  return `use${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`;
}

/**
 * Resolve one member of an open-key standard hook family. `member` is present
 * only when the Hook is called as `useName(key, member)`; the resolver returns
 * the same source object for the same arguments while that source is live.
 */
export type KeyedStandardSource = (
  key: string,
  member?: string,
) => HostObservable<unknown> | undefined;

/**
 * Framework-neutral inputs from which the renderer materializes standard
 * props. A scope adapter keeps member names present while its binding is
 * absent so optional slots retain a stable Hook call order.
 */
export interface StandardSourceBinding {
  /** Scope identity; absent for root data and an optional scope with no selection. */
  readonly key: string | undefined;
  /** Fixed-name sources; each `name` becomes a `useName` selector Hook. */
  readonly hooks: Readonly<Record<string, HostObservable<unknown> | undefined>>;
  /**
   * Open-key source families; each `name` becomes a `useName(key, selector?, equal?)`
   * Hook, which also accepts `useName(key, member)` to read the resolver's
   * `(key, member)` source without a selector.
   */
  readonly keyedHooks: Readonly<
    Record<string, KeyedStandardSource | undefined>
  >;
  /** Stable plain values copied into standard props. */
  readonly props: Readonly<Record<string, unknown>>;
}

/** Materialized binding for one live non-root scope. */
export interface ScopedStandardSourceBinding extends StandardSourceBinding {
  readonly key: string;
  readonly ctx: Context;
}

/** One installed source of bindings for a non-root Slot scope. */
export interface SlotScopeAdapter {
  /** Default binding inherited by scoped entries, including its absent projection. */
  readonly current: HostObservable<StandardSourceBinding>;
  /**
   * Resolve a stable observable for an explicit scope target or explicit absence.
   * @param target - domain-owned Provider target, or absence.
   * @returns the target's current standard-source binding.
   */
  bindingSource(
    target: SessionAreaProps["session"],
  ): HostObservable<StandardSourceBinding>;
  /**
   * Render the scope owner's area seat over the current binding. The renderer
   * binds this function to the standard `SessionProvider` prop without owning
   * Session selection semantics.
   * @param binding - current scope binding, including its absent projection.
   * @param props - render-prop body and empty branch.
   * @returns rendered scope area.
   */
  renderArea?(
    binding: StandardSourceBinding,
    props: SessionAreaProps,
  ): ReactNode;
}

/** Root standard-source contribution installed by one domain UI package. */
export interface RootStandardSourceContribution {
  readonly hooks?: Readonly<Record<string, HostObservable<unknown>>>;
  readonly keyedHooks?: Readonly<Record<string, KeyedStandardSource>>;
  readonly props?: Readonly<Record<string, unknown>>;
}

/** renderSlot dispatch options at the machinery level. */
export interface RenderOpts {
  entryKey?: string;
  only?: string;
  fallback?: ReactNode;
  /** Opaque occurrence context consumed only by function-valued injected Hooks. */
  hookContext?: unknown;
}

/** Host API the `ui-renderer` SlotRegistry presents to its React renderer. */
export interface SlotRendererHost {
  /**
   * Subscribe to a key's registration changes (microtask-batched).
   * @param key - slot key.
   * @param fn - change callback.
   * @returns unsubscribe.
   */
  subscribe(key: string, fn: () => void): () => void;
  /**
   * Monotonic version for uSES pairing.
   * @param key - slot key.
   * @returns current version.
   */
  getVersion(key: string): number;
  /**
   * Snapshot the registered entries for a key (stable reference between mutations).
   * @param key - slot key.
   * @returns entries in registration (list: order) sequence.
   */
  entriesOf(key: string): readonly StoredEntry[];
  /**
   * Shadowing winners per cell for a key — the render read for single/keyed/
   * list dispatch: the first live (non-abdicated) entry of each cell in
   * priority order; chain keys pass through unchanged (election consumes
   * every entry). Fresh array per call — a render-body read, not a uSES
   * getSnapshot source.
   * @param key - slot key.
   * @returns the winning entry per occupied cell.
   */
  entriesOfSlot(key: string): readonly StoredEntry[];
  /**
   * Report an entry boundary crash. With `info.abdicate` (shadowing kinds)
   * the entry retires from its cell, one-shot, so the next survivor renders;
   * chain crashes report without abdicating. The registration stays on the
   * ledger either way.
   * @param key - slot key the entry rendered under.
   * @param entry - the crashed entry.
   * @param error - the crash cause.
   * @param info - `abdicate`: whether the crash retires the entry from its cell.
   */
  reportEntryError(
    key: string,
    entry: StoredEntry,
    error: unknown,
    info: { abdicate: boolean },
  ): void;
  /**
   * Declared runtime spec from the declarations ledger.
   * @param key - slot key.
   * @returns the spec, or undefined while the key is undeclared (outlets render empty).
   */
  specOf(key: string): SlotSpec<SlotEntryDef> | undefined;
  /**
   * Stale-authorization check: whether the entry is still in the ledger.
   * @param entry - a previously rendered entry.
   * @returns false once the entry's registration was disposed.
   */
  isLive(entry: StoredEntry): boolean;
  /** Root standard data assembled from domain-owned contributions. */
  readonly root: HostObservable<StandardSourceBinding>;
  /** Monotonic source updated whenever the installed scope-adapter roster changes. */
  readonly scopeRevision: HostObservable<number>;
  /**
   * Resolve the adapter installed for one non-root scope.
   * `session` and `session-maybe` intentionally resolve the same adapter.
   * @param scope - Slot scope.
   * @returns adapter, or `undefined` when the composition omitted its owner.
   */
  scope(scope: Exclude<SlotScope, "root">): SlotScopeAdapter | undefined;
}

/** The installation contract between the `ui-renderer` SlotRegistry and its React renderer. */
export interface SlotRenderer {
  /**
   * Render the root slot tree over the host API (the only ctx-level entry).
   * @param host - the installing service's host API.
   * @param ownerProps - owner props from the shell's renderSlot('root', ...) call.
   * @returns the rendered tree.
   */
  renderRoot(host: SlotRendererHost, ownerProps: object): ReactNode;
}

/** Thrown when a retained renderSlot binding is invoked after its declaring entry was disposed. */
export class StaleAuthorizationError extends Error {}

/**
 * Thrown when a renderSlot binding is invoked for a key outside its entry's
 * children declaration (plain-JS backstop; typed callers are narrowed
 * statically).
 */
export class SlotOwnershipError extends Error {}
