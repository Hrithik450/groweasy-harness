/**
 * Sidebar slot contract.
 *
 * The layout package (`@openai-harness/client-ui-layout`) owns and declares
 * the `sidebar` slot; this package contributes the one occupant. The type-only
 * import below loads that SlotMap row so {@link PropsRuntime}<'sidebar'> picks
 * up the owner share (`initialSessions`, `initialUser`) the app frame forwards.
 *
 * Host-only bindings used by the original app-side component (modal opening,
 * SPA navigation, and an externally supplied pathname) stay optional on the
 * occupant; the layout's owner share remains unchanged.
 */
import type {
  PropsRuntime,
} from "@openai-harness/client-ui-slots";
import type { SidebarOwnerProps } from "@openai-harness/client-ui-layout/client";
// Loads the renderer-owned `ctx.slots` type merge.
import type {} from "@openai-harness/client-ui-renderer/client";

export type { SidebarOwnerProps };

/** Optional host bindings layered on top of the layout owner share. */
export interface SidebarHostBindings {
  /**
   * Current route pathname. A shell supplies its own navigation binding;
   * when omitted the occupant reads and subscribes to `window.location`.
   */
  pathname?: string;
  /**
   * Shell navigation hook. When supplied, session links call it instead of
   * performing a full browser navigation.
   */
  onNavigate?: (href: string) => void;
  /**
   * Open the host's settings surface. The sidebar owns no settings state;
   * without a callback the Settings row is inert.
   */
  onOpenSettings?: () => void;
  /**
   * Host override for the New Session action. When omitted the sidebar
   * creates the session through `@openai-harness/client-rpc`.
   */
  onNewSession?: () => void;
}

/** Full props of the `sidebar` occupant: layout owner share + host bindings. */
export type SidebarRootProps = PropsRuntime<"sidebar"> & SidebarHostBindings;
