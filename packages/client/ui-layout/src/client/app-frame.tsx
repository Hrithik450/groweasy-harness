/**
 * The application frame, contributed into the built-in `root` slot.
 *
 * Markup and Tailwind classes are the app's existing shell, unchanged:
 * `main.h-screen.w-screen.flex.overflow-hidden.bg-background` with the
 * flexible content column. The frame imports no Sidebar, chat, or modal
 * component; each seat renders a slot outlet instead. Every outlet anchor
 * uses `display: contents`, so an empty seat does not alter the flex layout.
 */
import {
  AppToaster,
  AuthRedirectNotice,
} from "@openai-harness/client-ui-primitives";
import type { AppFrameProps } from "./types";

/** Default keyed `main` entry when the host does not select one. */
export const DEFAULT_MAIN_KEY = "conversation";

/**
 * Render the app frame and its four child seats.
 * @param props - slot render share plus resolved bootstrap bindings.
 * @returns the shell markup.
 */
export function AppFrame({
  renderSlot,
  initialSessions,
  initialUser,
  mainKey = DEFAULT_MAIN_KEY,
}: AppFrameProps) {
  return (
    <main className="h-screen w-screen flex overflow-hidden bg-background">
      {renderSlot("sidebar", { initialSessions, initialUser })}

      <div className="flex-1 flex h-full min-w-0 bg-background overflow-hidden">
        {renderSlot("main", {}, { entryKey: mainKey })}
      </div>

      {renderSlot("rightbar", {})}
      {renderSlot("shell.overlay", {})}
      {/* Portalled toast host; the packages call sonner's `toast` directly. */}
      <AppToaster />
      {/* Reports a failed OAuth callback, which lands here as `?error=`. */}
      <AuthRedirectNotice />
    </main>
  );
}
