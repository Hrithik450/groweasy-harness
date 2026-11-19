/**
 * One in-process event bus for every live stream.
 *
 * Producers publish named events on a key; an open stream subscribes to the
 * keys it serves. Keys are opaque strings, so the bus never learns what a
 * session or a user is.
 *
 * @module @/lib/session/bus
 */

/** One named event, ready to become an SSE frame. */
export interface BusEvent {
  event: string;
  data: unknown;
}

type Listener = (event: BusEvent) => void;

interface BusState {
  channels: Map<string, Set<Listener>>;
}

const globalForBus = globalThis as unknown as { __streamBus?: BusState };

/** globalThis keeps the bus alive across dev HMR and route reloads. */
const state = (globalForBus.__streamBus ??= {
  channels: new Map<string, Set<Listener>>(),
});

/** Publish one event to everyone watching `key`. */
export function publish(key: string, event: BusEvent): void {
  const listeners = state.channels.get(key);
  if (!listeners) return;

  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      // A broken subscriber must not stop the others or the producer.
      console.error("[bus] listener failed:", error);
    }
  }
}

/** Watch one key; returns the unsubscribe. */
export function subscribe(key: string, listener: Listener): () => void {
  let listeners = state.channels.get(key);
  if (!listeners) {
    listeners = new Set();
    state.channels.set(key, listeners);
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) state.channels.delete(key);
  };
}
