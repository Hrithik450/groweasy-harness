/**
 * Settings, New Session, and image lightbox overlays.
 *
 * Each surface is a self-gating list entry: it renders nothing until its
 * `@openai-harness/client-ui-session` store says it is open, so the shell can
 * mount all three for the whole session. Registration waits for the layout's
 * `shell.overlay` declaration through `ctx.slots.inject`.
 *
 * @module @openai-harness/client-ui-modals/client
 */
import type { ReactNode } from "react";
import type { Context } from "@deepseek-ai/cordis";
// Loads the `ctx.slots` contract from ui-renderer.
import type {} from "@openai-harness/client-ui-renderer/client";
import type {} from "@openai-harness/client-ui-slots";
import { SettingsModal } from "./settings.modal";
import { NewSessionModal } from "./new.session.modal";
import { ImageboxModal } from "./image.lightbox.modal";

declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    /**
     * Shell-wide floating overlay list. Mirrors the layout owner's declaration
     * (`kind: "list"`, root scope, no owner data) so the type merges cleanly.
     */
    "shell.overlay": { kind: "list"; scope: "root"; owner: object };
  }
}

/** One overlay contribution owned by this package. */
export interface ModalsOverlayEntry {
  /** Stable list-cell id (also the slot entry `id`). */
  id: string;
  /** Overlay surface rendered by the shell. */
  component: () => ReactNode;
}

/** Overlay seats contributed by the modals package. */
export const MODALS_OVERLAY_ENTRIES: readonly ModalsOverlayEntry[] = [
  { id: "settings", component: SettingsModal },
  { id: "new-session", component: NewSessionModal },
  { id: "image-lightbox", component: ImageboxModal },
];

/** Requires the renderer-owned slot service before registering. */
export const inject = ["slots"];

/**
 * Register every modal overlay seat.
 * @param ctx - client context carrying `ctx.slots`.
 */
export function apply(ctx: Context): void {
  for (const entry of MODALS_OVERLAY_ENTRIES) {
    ctx.slots.inject("shell.overlay", () =>
      ctx.slots.register(
        { name: "shell.overlay", id: entry.id },
        entry.component,
      ),
    );
  }
}

export { SettingsModal } from "./settings.modal";
export { NewSessionModal } from "./new.session.modal";
export {
  ImageboxModal,
  ImageLightboxModal,
  type Image,
  type ImageboxModalProps,
  type LightboxImage,
} from "./image.lightbox.modal";
export { createSession, resetSessionRpc } from "./session-rpc";
export {
  configureShellNavigation,
  navigateTo,
  navigateToSession,
  type ShellNavigator,
} from "./navigation";
export {
  configureModalsGateway,
  gatewayFetch,
  resetModalsGateway,
  resolveGatewayBaseUrl,
  resolveGatewayHttpBase,
  type ModalsGatewayConfig,
} from "./gateway";
