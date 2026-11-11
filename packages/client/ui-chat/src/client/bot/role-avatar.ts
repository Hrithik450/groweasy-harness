/**
 * Role avatar resolution for the animated bot character.
 *
 * Ported from the application sidebar (`src/components/sidebar/sidebar.tsx`)
 * so the chat package can resolve a session's animated role icon without
 * importing application-side modules.
 *
 * @module @openai-harness/client-ui-chat/client/bot/role-avatar
 */

import type { SessionView } from "@openai-harness/session";

const botAvatars = [
  "sales-outbound-animated.svg",
  "account-manager-animated.svg",
  "chief-animated.svg",
  "inbox-manager-animated.svg",
  "talent-scout-animated.svg",
  "expense-manager-animated.svg",
  "offsite-crew-animated.svg",
  "grok-bot-animated.svg",
  "gem-animated.svg",
  "crystal-animated.svg",
];

/**
 * Resolves a distinct animated bot avatar icon matching the session's agent
 * role.
 * @param session - session whose title/id select the role avatar.
 * @returns a public `/bot/...` asset path.
 */
export function getRoleAvatar(session: SessionView): string {
  const text = (session.title || "").toLowerCase();

  if (text.includes("strategist") || text.includes("strategy")) {
    return "/bot/sales-outbound-animated.svg";
  }
  if (text.includes("manager") || text.includes("management")) {
    return "/bot/account-manager-animated.svg";
  }
  if (text.includes("creator") || text.includes("creative")) {
    return "/bot/chief-animated.svg";
  }

  const hash = Math.abs(
    (session.id || session.title || "").split("").reduce((acc, char) => {
      return (acc << 5) - acc + char.charCodeAt(0);
    }, 0),
  );

  return `/bot/${botAvatars[hash % botAvatars.length]}`;
}
