/**
 * Shared client state layer for the browser UI packages.
 *
 * Fixed exports:
 * - stores: `useSessionStore`, `useSidebarStore`, `useModalStore`,
 *   `useConnectorStore`, `useUserStore`
 * - hooks: `useChatStream`, `useBusinessProfile`
 *
 * Application bindings (RPC client, session journal, transports) are injected
 * through `configureClientSession`.
 *
 * @module @openai-harness/client-ui-session
 */

export * from "./config";
export * from "./store/index";
export * from "./hooks/index";
export * from "./types/connectors";
export type { OptimisticPrompt } from "./internal/pending";
