/**
 * Layout plugin, browser half.
 *
 * One `register()` call contributes {@link AppFrame} into the runtime's
 * built-in `root` slot and declares the frame's child seats in the same
 * breath (declaration = exclusive render authority). Bootstrap data arrives
 * through the plugin config, is injected into the frame as props, and is
 * forwarded to the sidebar owner. The frame never imports the app's Sidebar,
 * chat surface, or modal components.
 */
import type { Context } from "@deepseek-ai/cordis";
// Loads the `root` slot contract from ui-renderer.
import type {} from "@openai-harness/client-ui-renderer/client";
import { AppFrame, DEFAULT_MAIN_KEY } from "./app-frame";
import type { LayoutBootstrap, LayoutConfig } from "./types";

export { AppFrame, DEFAULT_MAIN_KEY };
export type {
  AppFrameProps,
  LayoutBootstrap,
  LayoutChildSlots,
  LayoutConfig,
  OverlayOwnerProps,
  RightbarOwnerProps,
  SidebarOwnerProps,
} from "./types";

/** Requires the renderer-owned slot service before the frame registers. */
export const inject = ["slots"];

/**
 * Register the app frame into `root` and declare its child slots.
 * @param ctx - client root context carrying `ctx.slots`.
 * @param config - bootstrap bindings supplied by the host (session/user data
 *   fetched at the server boundary, plus the selected main key).
 */
export function apply(ctx: Context, config: LayoutConfig = {}): void {
  const bootstrap: LayoutBootstrap = {
    initialSessions: config.initialSessions ?? [],
    initialUser: config.initialUser ?? null,
    mainKey: config.mainKey ?? "conversation",
  };

  ctx.slots.register(
    {
      name: "root",
      registrant: "@openai-harness/client-ui-layout",
      children: {
        sidebar: { kind: "single", scope: "root" },
        main: { kind: "keyed", scope: "root" },
        rightbar: { kind: "single", scope: "root" },
        "shell.overlay": { kind: "list", scope: "root" },
      },
      inject: () => bootstrap,
    },
    AppFrame,
  );
}
