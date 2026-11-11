/**
 * Browser chat plugin.
 *
 * One registration contributes the conversation area into the layout's keyed
 * `main` slot under the reserved key `conversation`, and declares the child
 * seats it renders (declaration = exclusive render authority). Default header,
 * empty-state, composer, turn, message, avatar, loader, and thinking renderers
 * are registered into those seats so the surface is complete without further
 * assembly; a host replaces one by registering a lower `priority` at the same
 * cell.
 *
 * The app's `DetailBar` is deliberately not here: it stays application-side
 * and registers into the frame's root `rightbar` seat.
 *
 * @module @openai-harness/client-ui-chat/client
 */

import type { Context } from "@deepseek-ai/cordis";
// Loads the `ctx.slots` host contract and the layout-owned `main` SlotMap row.
import type {} from "@openai-harness/client-ui-renderer/client";
import type {} from "@openai-harness/client-ui-layout/client";
import type { PropsRenderSlots } from "@openai-harness/client-ui-slots";
import { ConversationView } from "./ConversationView";
import { ChatHeader } from "./ChatHeader";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatComposer } from "./ChatComposer";
import { TurnNode } from "./TurnNode";
import { UserMessageNode } from "./UserMessageNode";
import { AssistantMessageNode } from "./AssistantMessageNode";
import { BotDollAvatar, BotDollLoader, ChiefThinking } from "./bot";
import type {
  AvatarOwnerProps,
  ChatChildSlot,
  ChatConfig,
  ChatNodeOwnerProps,
  ComposerOwnerProps,
  EmptyOwnerProps,
  HeaderOwnerProps,
  LoaderOwnerProps,
  ThinkingOwnerProps,
} from "./types";

export type {
  ActionComplete,
  AvatarOwnerProps,
  ChatChildSlot,
  ChatConfig,
  ChatNodeOwnerProps,
  ComposerOwnerProps,
  ConversationViewProps,
  EmptyOwnerProps,
  HeaderOwnerProps,
  LoaderOwnerProps,
  SendMessage,
  ThinkingOwnerProps,
} from "./types";
export { ConversationView } from "./ConversationView";
export { ChatHeader } from "./ChatHeader";
export { ChatEmptyState } from "./ChatEmptyState";
export { ChatComposer } from "./ChatComposer";
export { ChatInputForm } from "./ChatInputForm";
export { TurnNode } from "./TurnNode";
export { UserMessageNode, InlineMessageMedia } from "./UserMessageNode";
export { AssistantMessageNode } from "./AssistantMessageNode";
export {
  BotDollAvatar,
  type BotDollAvatarProps,
  BotDollLoader,
  type BotDollLoaderProps,
  ChiefThinking,
  getRoleAvatar,
} from "./bot";
export {
  collectMediaLinks,
  parseUserMessageMedia,
  USER_AUDIO_RE,
  USER_IMAGE_RE,
  USER_VIDEO_RE,
} from "./media";
export { markdownComponents } from "./markdown";

/** Reserved layout key that hosts the chat surface. */
export const CONVERSATION_MAIN_KEY = "conversation" as const;

/** Slot key of the conversation area's layout seat. */
export const MAIN_SLOT = "main" as const;

declare module "@openai-harness/client-ui-slots" {
  interface SlotMap {
    /** Conversation header row. */
    "conversation.header": {
      kind: "single";
      scope: "root";
      owner: HeaderOwnerProps;
    };
    /** Centered empty-conversation suggestion grid. */
    "conversation.empty": {
      kind: "single";
      scope: "root";
      owner: EmptyOwnerProps;
    };
    /** Suggestion chips plus the attachment-aware input form. */
    "conversation.composer": {
      kind: "single";
      scope: "root";
      owner: ComposerOwnerProps;
    };
    /**
     * Chat node renderer, keyed by node kind. Reserved keys:
     * `turn` (whole turn), `user` (one input), `assistant` (one answer).
     */
    "conversation.chat.node": {
      kind: "keyed";
      scope: "root";
      owner: ChatNodeOwnerProps;
    };
    /** Animated bot avatar used by the empty state and loader seats. */
    "conversation.avatar": {
      kind: "single";
      scope: "root";
      owner: AvatarOwnerProps;
    };
    /** Transcript loader for initial load and older-turn pagination. */
    "conversation.loader": {
      kind: "single";
      scope: "root";
      owner: LoaderOwnerProps;
    };
    /** Streaming thinking row shown below the last turn. */
    "conversation.thinking": {
      kind: "single";
      scope: "root";
      owner: ThinkingOwnerProps;
    };
  }
}

/** Requires the renderer-owned slot service before registering. */
export const inject = ["slots"];

const REGISTRANT = "@openai-harness/client-ui-chat";

/**
 * Register the conversation area and its default seats.
 * @param ctx - client context carrying `ctx.slots`.
 * @param config - active session id, optional bootstrap session, and upload URL.
 */
export function apply(ctx: Context, config: ChatConfig): void {
  if (config?.sessionId === undefined) {
    throw new Error(
      "@openai-harness/client-ui-chat: apply({ sessionId }) requires the active session id.",
    );
  }

  ctx.slots.inject(MAIN_SLOT, () => {
    const disposers: (() => void)[] = [];

    // Explicit props keep the registration component's share precise: the
    // frame supplies the child renderer, this closure supplies the config.
    const ConversationEntry = (props: PropsRenderSlots<ChatChildSlot>) => (
      <ConversationView {...props} config={config} />
    );

    disposers.push(
      ctx.slots.register(
        {
          name: MAIN_SLOT,
          key: CONVERSATION_MAIN_KEY,
          registrant: REGISTRANT,
          children: {
            "conversation.header": {
              kind: "single",
              scope: "root",
            },
            "conversation.empty": {
              kind: "single",
              scope: "root",
            },
            "conversation.composer": {
              kind: "single",
              scope: "root",
            },
            "conversation.chat.node": {
              kind: "keyed",
              scope: "root",
            },
            "conversation.avatar": {
              kind: "single",
              scope: "root",
            },
            "conversation.loader": {
              kind: "single",
              scope: "root",
            },
            "conversation.thinking": {
              kind: "single",
              scope: "root",
            },
          },
        },
        ConversationEntry,
      ),
    );

    disposers.push(
      ctx.slots.register(
        { name: "conversation.header", registrant: REGISTRANT },
        ChatHeader,
      ),
      ctx.slots.register(
        { name: "conversation.empty", registrant: REGISTRANT },
        ChatEmptyState,
      ),
      ctx.slots.register(
        { name: "conversation.composer", registrant: REGISTRANT },
        ChatComposer,
      ),
      ctx.slots.register(
        {
          name: "conversation.chat.node",
          key: "turn",
          registrant: REGISTRANT,
        },
        TurnNode,
      ),
      ctx.slots.register(
        {
          name: "conversation.chat.node",
          key: "user",
          registrant: REGISTRANT,
        },
        UserMessageNode,
      ),
      ctx.slots.register(
        {
          name: "conversation.chat.node",
          key: "assistant",
          registrant: REGISTRANT,
        },
        AssistantMessageNode,
      ),
      ctx.slots.register(
        { name: "conversation.avatar", registrant: REGISTRANT },
        BotDollAvatar,
      ),
      ctx.slots.register(
        { name: "conversation.loader", registrant: REGISTRANT },
        BotDollLoader,
      ),
      ctx.slots.register(
        { name: "conversation.thinking", registrant: REGISTRANT },
        ChiefThinking,
      ),
    );

    return disposers;
  });
}
