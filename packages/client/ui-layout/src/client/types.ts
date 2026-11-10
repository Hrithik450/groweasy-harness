/**
 * Slot contracts and bootstrap bindings for the app frame.
 *
 * The frame declares four root-scoped seats and accepts its bootstrap data
 * through props (bound from the Cordis plugin config by `apply`), never
 * through server-route props. Owner shares below are what the frame passes at
 * its `renderSlot` call sites; registrants compose their full props from them
 * plus the framework standard kit.
 */
import type {
  PropsRenderSlots,
  PropsRuntime,
} from "@openai-harness/client-ui-slots";
import type { SessionView, UserView } from "@openai-harness/session";
// Loads ui-renderer's `root` SlotMap row (registration target + PropsRuntime).
import type {} from "@openai-harness/client-ui-renderer/client";

/**
 * Bootstrap data the frame forwards to the sidebar occupant. The sidebar is
 * the app's own navigation column; the frame never renders it directly.
 */
export interface SidebarOwnerProps {
  /** Sessions known at first paint (server-fetched, then hydrated app-side). */
  initialSessions: SessionView[];
  /** Signed-in user, or null/absent when unauthenticated. */
  initialUser?: UserView | null;
}

/** Right column owner share. No geometry contract is imposed by this frame. */
export type RightbarOwnerProps = object;

/** Frame-wide overlay entry share (list rows receive no owner data). */
export type OverlayOwnerProps = object;

/** Cordis plugin config: the frame's bootstrap bindings. */
export interface LayoutConfig {
  /** Sessions known at first paint; defaults to an empty list. */
  initialSessions?: SessionView[];
  /** Signed-in user; defaults to null. */
  initialUser?: UserView | null;
  /**
   * Keyed `main` entry rendered by the frame. The reserved default
   * `conversation` hosts the chat surface; other keys host global panels.
   */
  mainKey?: string;
}

/** Fully resolved bootstrap props consumed by {@link AppFrame}. */
export interface LayoutBootstrap {
  initialSessions: SessionView[];
  initialUser: UserView | null;
  mainKey: string;
}

/** Child slots the frame declares and renders. */
export type LayoutChildSlots =
  | "sidebar"
  | "main"
  | "rightbar"
  | "shell.overlay";

/** Composed props of the frame component (runtime share + frame bindings). */
export type AppFrameProps = PropsRuntime<"root"> &
  PropsRenderSlots<LayoutChildSlots> &
  LayoutBootstrap;

declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    /**
     * The whole left column. The occupant (the app's Sidebar) owns its own
     * markup and receives the frame's bootstrap data.
     */
    sidebar: {
      kind: "single";
      scope: "root";
      owner: SidebarOwnerProps;
    };
    /**
     * Central panel selected by key. `conversation` is the reserved key for
     * the chat surface; other keys receive no session binding from the frame.
     */
    main: { kind: "keyed"; scope: "root" };
    /** The right column, rendered beside the central panel when occupied. */
    rightbar: {
      kind: "single";
      scope: "root";
      owner: RightbarOwnerProps;
    };
    /**
     * Frame-wide floating layer for modals, toasts, and status surfaces.
     * Additive list: each entry has its own `id`.
     */
    "shell.overlay": {
      kind: "list";
      scope: "root";
      owner: OverlayOwnerProps;
    };
  }
}
