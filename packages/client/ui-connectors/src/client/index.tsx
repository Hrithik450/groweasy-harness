/**
 * Connector Manager UI: registers the Connectors catalogue and its per-provider
 * manager as `shell.overlay` seats.
 *
 * The shell declares `shell.overlay` (a root-scoped list); this package waits
 * for that declaration through `slots.inject`, matching the reference client
 * packages, so load order is irrelevant.
 */
import type { ReactNode } from "react";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@openai-harness/client-ui-renderer/client";
import type {} from "@openai-harness/client-ui-slots";
import { ConnectorManagerModal } from "./connectors/connector.manager.modal";
import { ConnectorsModal } from "./connectors/connectors.modal";

declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    /** Shell-wide floating overlay list (toasts, managers, lightboxes). */
    "shell.overlay": { kind: "list"; scope: "root"; owner: object };
  }
}

/** One overlay contribution owned by this package. */
export interface ConnectorOverlayEntry {
  /** Stable list-cell id (also the slot entry `id`). */
  id: string;
  /** Overlay surface rendered by the shell. */
  component: () => ReactNode;
}

/** Overlay seats contributed by the Connector Manager. */
export const CONNECTOR_OVERLAY_ENTRIES: readonly ConnectorOverlayEntry[] = [
  { id: "connectors", component: ConnectorsModal },
  // The manager used to receive a refresh callback from its parent
  // catalogue; it now refreshes the catalogue itself, so the overlay
  // component takes no props.
  { id: "connectors.manager", component: () => <ConnectorManagerModal /> },
];

/** Requires the renderer-owned slot service before registering. */
export const inject = ["slots"];

/**
 * Register every connector overlay seat.
 * @param ctx - client context carrying `ctx.slots`.
 */
export function apply(ctx: Context): void {
  for (const entry of CONNECTOR_OVERLAY_ENTRIES) {
    ctx.slots.inject("shell.overlay", () =>
      ctx.slots.register(
        { name: "shell.overlay", id: entry.id },
        entry.component,
      ),
    );
  }
}

export { ConnectorManagerModal } from "./connectors/connector.manager.modal";
export { ConnectorsModal } from "./connectors/connectors.modal";
export { ConnectorIcon } from "./connectors/managers/base.modal";
export { getManagerModal, MANAGER_MODALS } from "./connectors/managers/registry";
export type { ManagerModalProps } from "./connectors/managers/registry";
export * from "./lib";
export {
  configureConnectorsClient,
  connectorsFetch,
  connectorsUrl,
  resetConnectorsClient,
  resolveGatewayHttpBase,
  resolveGatewayUrl,
} from "./connectors.client";
