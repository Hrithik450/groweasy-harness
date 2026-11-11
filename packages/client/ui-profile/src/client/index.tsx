/**
 * Business profile screen, browser half. The screen is a keyed entry in the
 * shell's `main` slot under {@link PROFILE_PANEL_ID}; the registration waits
 * for the layout package that declares `main` (`ctx.slots.inject`), so this
 * package can load before or after the shell.
 *
 * The screen owns no fonts and no document metadata: font faces and the
 * `--font-*` variables come from `@openai-harness/client-ui-theme`, and the
 * former Next.js `metadata` export is a `document.title` effect inside
 * {@link ProfilePage}.
 *
 * @module @openai-harness/client-ui-profile/client
 */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@openai-harness/client-ui-renderer/client";
import type {} from "@openai-harness/client-ui-slots";
import { ProfilePage } from "./profile-page";

declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    /**
     * Central panel selected by sidebar entry id. The reserved
     * `conversation` key hosts the Conversation; page packages register
     * route entries under their own key.
     */
    main: { kind: "keyed"; scope: "root" };
  }
}

/** Keyed `main` entry id of the profile route. */
export const PROFILE_PANEL_ID = "profile";

/** Required services (the renderer-owned slot registry). */
export const inject = ["slots"];

/**
 * Register the profile screen into the keyed `main` slot once the shell
 * declares it.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject("main", () =>
    ctx.slots.register(
      { name: "main", key: PROFILE_PANEL_ID },
      ProfilePage,
    ),
  );
}

export { BrandSection } from "./brand-section";
export { BusinessTrackingSection } from "./business-tracking-section";
export { CompetitorsSection } from "./competitors-section";
export { GoalsSection } from "./goals-section";
export { LocationsSection } from "./locations-section";
export { ProductsSection } from "./products-section";
export { ProfileHeader } from "./profile-header";
export { ProfileHero } from "./profile-hero";
export { ProfilePage, PROFILE_TITLE } from "./profile-page";
export { SectionHeading } from "./section-heading";
export { SectionNav } from "./section-nav";
export { SectionNavClient, type SectionNavItem } from "./section-nav-client";
export * from "./styles";
