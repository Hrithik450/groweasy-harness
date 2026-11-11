/**
 * Owner-prop contracts and plugin config for the chat surface.
 *
 * The conversation area owns every seat it renders. Owner props below are the
 * shares its `renderSlot` call sites pass; registrants compose them with the
 * framework standard kit. Chat node keys are plain strings so a host can add
 * renderers without changing the slot declaration.
 *
 * @module @openai-harness/client-ui-chat/client/types
 */

import type { ReactNode } from "react";
import type { UIBlockSpec } from "@openai-harness/generative-ui";
import type { SessionView } from "@openai-harness/session";
import type {
  SurfaceItem,
  TurnNode,
} from "@openai-harness/session-projection";
import type { PropsRenderSlots } from "@openai-harness/client-ui-slots";

/** Cordis plugin config supplied by the host. */
export interface ChatConfig {
  /**
   * Session rendered by this client tree. Replaces the Next `useParams` read;
   * the shell boots one client context per `/c/[sessionId]` route.
   */
  sessionId: string;
  /** Server-fetched session used before the client store hydrates. */
  initialSession?: SessionView;
  /** Attachment upload endpoint. Defaults to `/api/attachments/upload`. */
  attachmentsUploadUrl?: string;
}

/** Composer submission. `hidden` marks UI-synthesized prompts. */
export type SendMessage = (
  content: string,
  options?: { hidden?: boolean; isHidden?: boolean },
) => Promise<void> | void;

/** Interactive block submission. */
export type ActionComplete = (
  messageId: string,
  blockId: string,
  updatedUI: UIBlockSpec,
) => Promise<void> | void;

/** Header seat owner props. */
export interface HeaderOwnerProps {
  sessionId: string;
  session?: SessionView;
  title?: string;
  className?: string;
}

/** Avatar seat owner props. */
export interface AvatarOwnerProps {
  size?: number;
  avatarUrl?: string;
  className?: string;
  withShadow?: boolean;
  fast?: boolean;
  interactive?: boolean;
  /** Active session used to resolve the role avatar. */
  sessionId?: string;
}

/** Empty-state seat owner props. */
export interface EmptyOwnerProps {
  sessionId: string;
  /** Session title; defaults to the app's generic agent name. */
  title?: string;
  onSelectPrompt: (prompt: string) => void;
  /** Avatar seat bound by the conversation owner. */
  renderAvatar?: (props: AvatarOwnerProps) => ReactNode;
}

/** Composer seat owner props. */
export interface ComposerOwnerProps {
  sessionId: string;
  /** Session title used by the placeholder. */
  title: string;
  isStreaming: boolean;
  onSubmit: SendMessage;
  onStop: () => void;
  /** Attachment upload endpoint override. */
  uploadUrl?: string;
}

/**
 * Chat node seat owner props, shared by every keyed node renderer.
 *
 * Reserved keys registered by this package:
 * - `turn` — one complete turn (`TurnNode`), including status and usage.
 * - `user` — one user input (`input`), rendered as the brand bubble.
 * - `assistant` — one settled assistant answer (`turn.finalAnswer`).
 */
export interface ChatNodeOwnerProps {
  turn: TurnNode;
  /** User input for the `user` key. */
  input?: SurfaceItem;
  isStreamingTurn?: boolean;
  /**
   * Whether this is the newest turn in the conversation. Only the newest turn
   * accepts answers: once a later turn exists, its blocks are read-only even
   * if the user never answered them. Defaults to true.
   */
  isLatestTurn?: boolean;
  onActionComplete?: ActionComplete;
  onBlockValueChange?: (
    messageId: string,
    fieldId: string,
    value: unknown,
  ) => void;
  /** Node seat bound to the `user` key. */
  renderUserMessage?: (input: SurfaceItem) => ReactNode;
  /** Node seat bound to the `assistant` key. */
  renderAssistantMessage?: (answer: SurfaceItem) => ReactNode;
}

/** Loader seat owner props (`BotDollLoader` variants). */
export interface LoaderOwnerProps {
  variant?: "top-banner" | "center";
  text?: string;
  subtitle?: string;
  size?: number;
  avatarUrl?: string;
  className?: string;
  /** Active session used to resolve the role avatar. */
  sessionId?: string;
}

/** Thinking-row seat owner props. */
export interface ThinkingOwnerProps {
  agentName?: string;
  className?: string;
  /** Active session used to resolve the role avatar. */
  sessionId?: string;
}

/**
 * Child slots the conversation area declares and renders.
 *
 * They are root-scoped: `client-ui-session` currently installs no session
 * scope adapter, and the slot renderer rejects a parent that declares a
 * session-scoped child without one. Root scope keeps the surface bootable;
 * move these to `session-maybe` once that adapter lands.
 */
export type ChatChildSlot =
  | "conversation.header"
  | "conversation.empty"
  | "conversation.composer"
  | "conversation.chat.node"
  | "conversation.avatar"
  | "conversation.loader"
  | "conversation.thinking";

/** Fully composed props of the conversation entry registered into `main`. */
export type ConversationViewProps = PropsRenderSlots<ChatChildSlot> & {
  config: ChatConfig;
};
