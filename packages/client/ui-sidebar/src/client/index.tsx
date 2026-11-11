/**
 * Sidebar plugin, browser half.
 *
 * The layout package declares the root-scoped `sidebar` seat; this plugin
 * waits for that declaration and contributes the app's existing sidebar as
 * its single occupant. Waiting through `ctx.slots.inject` keeps plugin load
 * order irrelevant: the registration installs when the seat appears and is
 * torn down with the declaring entry.
 */
import type { Context } from "@deepseek-ai/cordis";
// Loads the renderer-owned `ctx.slots` service merge.
import type {} from "@openai-harness/client-ui-renderer/client";
// Loads the `sidebar` SlotMap row declared by ui-layout.
import type {
  SidebarHostBindings,
  SidebarRootProps,
} from "./contract/slots";
import { Sidebar } from "./SidebarRoot";

export { Sidebar };
export { SidebarBotAvatar, getRoleAvatar } from "./avatar";
export {
  configureGatewayBaseUrl,
  googleLoginUrl,
  resolveGatewayBaseUrl,
  resolveGatewayOrigin,
} from "./auth";
export { useRoutePath } from "./route";
export { resetSessionRpc } from "./session-rpc";
export type {
  SidebarHostBindings,
  SidebarOwnerProps,
  SidebarRootProps,
} from "./contract/slots";

/** Requires the renderer-owned slot service before the sidebar registers. */
export const inject = ["slots"];

/**
 * Register the sidebar into the layout's `sidebar` slot.
 * @param ctx - client root context carrying `ctx.slots`.
 * @param bindings - optional host bindings (navigation, settings surface) the
 *   shell supplies to the occupant; omitted bindings keep the standalone
 *   defaults (plain browser navigation, inert settings row).
 */
export function apply(
  ctx: Context,
  bindings: SidebarHostBindings = {},
): void {
  ctx.slots.inject("sidebar", () =>
    ctx.slots.register(
      {
        name: "sidebar",
        registrant: "@openai-harness/client-ui-sidebar",
        inject: () => bindings,
      },
      Sidebar,
    ),
  );
}

/** Re-exported for consumers that need the composed occupant type. */
export type { SidebarRootProps as SidebarComponentProps };
