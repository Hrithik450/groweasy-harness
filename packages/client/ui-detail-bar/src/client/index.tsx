"use client";

/**
 * Browser half of the detail-bar package.
 *
 * The layout frame declares the `rightbar` slot; this plugin waits for that
 * declaration and contributes one entry to it. The entry resolves the current
 * Session from `@openai-harness/client-ui-session` and draws the registered
 * detail bar. Nothing is registered until the frame exists, so boot order is
 * the frame's decision.
 */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@openai-harness/client-ui-renderer/client";
import { GenerativeUIRenderer } from "@openai-harness/client-ui-generative/client";
import { RIGHTBAR_SLOT } from "./slots";
import { DetailBarSeat } from "./detail-bar-seat";
import { setDetailBarGenerativeUIRenderer } from "./generative-ui";

/** Browser services required before the seat can mount. */
export const inject = ["slots"];

/**
 * Register the detail bar into the frame's right column.
 * @param ctx - browser client context carrying the slot registry.
 */
export function apply(ctx: Context): void {
  // Alert cards render their diagnostic chart with the same json-render
  // renderer the chat blocks use. The host installs it here, at package boot,
  // so the unit is identical whether the chart came from a tool call or a
  // journal fold.
  setDetailBarGenerativeUIRenderer(GenerativeUIRenderer);

  ctx.slots.inject(RIGHTBAR_SLOT, () =>
    ctx.slots.register(
      {
        name: RIGHTBAR_SLOT,
        registrant: "@openai-harness/client-ui-detail-bar",
      },
      DetailBarSeat,
    ),
  );
}

export * from "./slots";
export * from "./registry";
export * from "./demo";
export * from "./detail-bar-seat";
export * from "./generative-ui";
export * from "./rpc";
export * from "./session";
export * from "../types";
export * from "../utils";
export * from "../constants";
