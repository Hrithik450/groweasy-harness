/**
 * Report screen, browser half. The screen is a keyed entry in the shell's
 * `main` slot under {@link REPORT_PANEL_ID}; the registration waits for the
 * layout package that declares `main` (`ctx.slots.inject`), so this package
 * can load before or after the shell.
 *
 * The screen owns no fonts and no document metadata: font faces and the
 * `--font-*` variables come from `@openai-harness/client-ui-theme`, and the
 * page title is a `document.title` effect inside {@link ReportPage}.
 *
 * @module @openai-harness/client-ui-report/client
 */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@openai-harness/client-ui-renderer/client";
import type {} from "@openai-harness/client-ui-slots";
import { ReportPage } from "./report-page";

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

/** Keyed `main` entry id of the report route. */
export const REPORT_PANEL_ID = "report";

/** Required services (the renderer-owned slot registry). */
export const inject = ["slots"];

/**
 * Register the report screen into the keyed `main` slot once the shell
 * declares it.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject("main", () =>
    ctx.slots.register(
      { name: "main", key: REPORT_PANEL_ID },
      ReportPage,
    ),
  );
}

export {
  parseReportPath,
  ReportPage,
  type ReportPath,
} from "./report-page";
