/**
 * uSES bridge: turns any bare observable snapshot source into a typed
 * selector hook. Client-side-rendered only, so no server snapshot is wired.
 * This is the ONE hook constructor in the client stack — engines and hosts
 * traffic in bare sources; binding happens on the React side.
 *
 * The reference harness consumes `use-sync-external-store/shim/with-selector`.
 * That package is not a dependency here, so the selector/equality memo is
 * implemented over React's stable `useSyncExternalStore` with the same
 * observable contract: a changed snapshot re-runs the selector, equality
 * suppresses downstream re-renders, and a changed selector identity
 * recomputes even when the snapshot is unchanged.
 */
import { useRef, useSyncExternalStore } from "react";
import type {
  HostObservable,
  SnapshotSelectorHook,
} from "@openai-harness/client-ui-slots";

interface SelectorMemo<T, S> {
  snapshot: T;
  selector: (snapshot: T) => S;
  equal: (left: S, right: S) => boolean;
  value: S;
}

/**
 * Bind a bare observable source to a typed uSES selector hook.
 * subscribe/getSnapshot are captured once per source into stable closures
 * (also re-binds `this` for method-based sources), so components never
 * resubscribe across renders. Equality defaults to Object.is.
 * @param source - snapshot source (standard source, scope binding, Store instance).
 * @returns the selector hook.
 */
export function bindSnapshotSelector<T>(
  source: HostObservable<T>,
): SnapshotSelectorHook<T> {
  const subscribe = (listener: () => void) => source.subscribe(listener);
  const getSnapshot = () => source.getSnapshot();

  return function useSelector<S>(
    selector: (snapshot: T) => S,
    equal: (left: S, right: S) => boolean = Object.is,
  ): S {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot);
    const memo = useRef<SelectorMemo<T, S> | null>(null);
    const current = memo.current;
    if (
      current === null ||
      !Object.is(current.snapshot, snapshot) ||
      current.selector !== selector
    ) {
      const value = selector(snapshot);
      if (
        current !== null &&
        current.selector === selector &&
        equal(current.value, value)
      ) {
        memo.current = { snapshot, selector, equal, value: current.value };
        return current.value;
      }
      memo.current = { snapshot, selector, equal, value };
      return value;
    }
    return current.value;
  };
}
