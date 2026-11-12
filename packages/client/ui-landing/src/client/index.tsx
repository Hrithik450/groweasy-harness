/**
 * Marketing landing screen, browser half. One register() call contributes the
 * screen into the runtime's built-in `root` slot, making the package the
 * application's landing route entry.
 *
 * The screen owns no fonts and no document metadata: font faces and the
 * `--font-*` variables come from `@openai-harness/client-ui-theme`, and the
 * former Next.js `metadata` export is a `document.title` effect inside
 * {@link LandingPage}.
 *
 * @module @openai-harness/client-ui-landing/client
 */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@openai-harness/client-ui-renderer/client";
import { LandingPage } from "./landing-page";

/** Required services (the renderer-owned slot registry). */
export const inject = ["slots"];

/**
 * Register the landing screen as the root route entry.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.slots.register({ name: "root" }, LandingPage);
}

export { AdSet } from "./ad-set";
export { ClosingSection } from "./closing-section";
export { Container } from "./container";
export { ControlSection } from "./control-section";
export { Footer } from "./footer";
export { Header } from "./header";
export { Hero } from "./hero";
export { IncreaseRoasSection } from "./increase-roas-section";
export { LandingPage, LANDING_TITLE } from "./landing-page";
export { SpotWinnersSection } from "./spot-winners-section";
export { StopLosersSection } from "./stop-losers-section";
export { TeamSection } from "./team-section";
export { Ticker } from "./ticker";
export {
  cn,
  Eyebrow,
  featureSectionClass,
  LandingButton,
  MockHead,
  MockPanel,
  MockRow,
  MockSub,
  SectionCopy,
  SectionParagraph,
  splitClass,
} from "./ui";
export { WatchMarketSection } from "./watch-market-section";
