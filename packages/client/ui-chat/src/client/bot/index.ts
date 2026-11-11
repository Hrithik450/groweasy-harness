/**
 * Bot character renderers shared by the chat seats and the connector surfaces.
 *
 * Single source of truth for `BotDollAvatar`, `BotDollLoader`, and
 * `ChiefThinking`; `@openai-harness/client-ui-connectors` imports them from
 * `@openai-harness/client-ui-chat/client` rather than keeping a copy.
 *
 * @module @openai-harness/client-ui-chat/client/bot
 */

export { BotDollAvatar, type BotDollAvatarProps } from "./bot.doll.avatar";
export { BotDollLoader, type BotDollLoaderProps } from "./bot.doll.loader";
export { ChiefThinking } from "./chief.thinking";
export { getRoleAvatar } from "./role-avatar";
