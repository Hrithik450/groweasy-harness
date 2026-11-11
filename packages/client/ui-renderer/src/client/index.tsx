/**
 * Browser UI renderer. It installs the slot renderer when its Cordis fiber
 * activates and exposes the mount operation used by the web boot kernel.
 */
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { Context } from "@deepseek-ai/cordis";
import { createSlotRenderer } from "./scoped-slots";
import { buildRenderApp } from "./app";
import { SlotRegistry } from "./registry";

export { SlotRegistry } from "./registry";
export type { RootOwnerProps } from "./registry";

export type {
  ChainRenderOpts,
  HostObservable,
  RenderOpts,
  SnapshotSelectorHook,
  SlotRenderer,
  ScopedStandardSourceBinding,
  SlotRendererHost,
  SlotScopeAdapter,
  StandardSourceBinding,
} from "@openai-harness/client-ui-slots";

/** Mount operation exposed to the framework-free boot kernel. */
export interface UiRendererService {
  /**
   * Mount the assembled application into the supplied element.
   * @param container - Application mount point.
   * @returns Disposer that unmounts the React root.
   */
  mount: (container: HTMLElement) => () => void;
}

declare module "@deepseek-ai/cordis" {
  interface Events {
    /**
     * An ordinary Slot declaration or entry registration set changed.
     * @mode emit
     * @param key - mutated SlotMap key.
     */
    "slots/changed"(key: string): void;
  }
  interface Context {
    /** Renderer-owned UI composition registry. */
    slots: SlotRegistry;
    /** Mount face provided after the UI renderer activates. */
    uiRenderer: UiRendererService;
  }
}

/** Services required before application assembly. */
export const inject: string[] = [];

/** Mount React and render the assembled application before the next paint. */
function mountApp(container: HTMLElement, app: () => ReactNode): Root {
  const root = createRoot(container);
  flushSync(() => {
    root.render(app());
  });
  return root;
}

/**
 * Install the slot renderer and provide the application mount face.
 * @param ctx - Plugin context.
 */
export function apply(ctx: Context): void {
  const slots = new SlotRegistry(ctx);
  slots.install(createSlotRenderer());
  ctx.reflect.provide("uiRenderer", {
    mount: (container: HTMLElement): (() => void) => {
      const root = mountApp(container, buildRenderApp({ ctx }));
      return () => {
        root.unmount();
      };
    },
  } satisfies UiRendererService);
}
