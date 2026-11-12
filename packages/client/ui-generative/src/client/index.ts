/**
 * Browser Generative UI plugin.
 *
 * Contributes one chat message-node seat (`conversation.chat.generative-ui`)
 * that renders an assistant-authored block with the app's unchanged
 * json-render registry. Domain types, the catalog, and validators come from
 * `@openai-harness/generative-ui`; viewers come from
 * `@openai-harness/client-ui-attachment-viewers`.
 *
 * @module @openai-harness/client-ui-generative/client
 */
import type { Context } from "@deepseek-ai/cordis";
// Loads the `ctx.slots` host contract from ui-renderer.
import type {} from "@openai-harness/client-ui-renderer/client";
import type {} from "@openai-harness/client-ui-slots";
import {
  GenerativeUINode,
  type GenerativeUINodeOwnerProps,
} from "./GenerativeUINode";

export {
  GenerativeUINode,
  type GenerativeUINodeOwnerProps,
} from "./GenerativeUINode";
export {
  GenerativeUIContext,
  GenerativeUIRenderer,
  type GenerativeUIContextValue,
  type GenerativeUIRendererProps,
} from "./renderer";
export {
  GenerativeUIContainerContext,
  registry,
} from "./registry";
export { useNormalizedFieldId } from "./field-id";
export * from "@openai-harness/generative-ui";

declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    /**
     * The Generative UI block seat inside one chat message. A chat owner must
     * declare this seat as a child slot (single, one block per message); the
     * plugin waits for that declaration through `ctx.slots.inject`.
     */
    "conversation.chat.generative-ui": {
      kind: "single";
      scope: "session-maybe";
      owner: GenerativeUINodeOwnerProps;
    };
  }
}

/** Requires the renderer-owned slot service before registering. */
export const inject = ["slots"];

/** Slot key this package owns. */
export const GENERATIVE_UI_SLOT = "conversation.chat.generative-ui" as const;

/**
 * Register the Generative UI message node when its slot is declared.
 * @param ctx - client context carrying `ctx.slots`.
 */
export function apply(ctx: Context): void {
  ctx.slots.inject(GENERATIVE_UI_SLOT, () =>
    ctx.slots.register(
      {
        name: GENERATIVE_UI_SLOT,
        registrant: "@openai-harness/client-ui-generative",
      },
      GenerativeUINode,
    ),
  );
}
