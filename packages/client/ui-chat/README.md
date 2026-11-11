# @openai-harness/client-ui-chat

The conversation surface for the Cordis browser shell. This package is the
existing application chat UI (`src/components/chat/**`) with its markup,
Tailwind classes, and behaviour unchanged; only imports and the session-id
source moved.

## Client half

```ts
import { apply as applyChat } from "@openai-harness/client-ui-chat/client";

await ctx.plugin({
  apply: applyChat,
  config: {
    sessionId,          // required: active `/c/[sessionId]` route id
    initialSession,     // optional: server-fetched SessionView
    attachmentsUploadUrl, // optional: default `/api/attachments/upload`
  },
});
```

`apply` waits for the layout's `main` slot (`ctx.slots.inject("main", ...)`),
then contributes the conversation area under the reserved key
`"conversation"` and declares the child seats it renders. The default header,
empty state, composer, node renderers, bot avatar, loader, and thinking row are
registered in the same effect, so the surface is complete without further
assembly. A host replaces a default by registering the same cell at a lower
`priority`.

The bot character lives in `src/client/bot/**` (`BotDollAvatar`,
`BotDollLoader`, `ChiefThinking`, and the role-avatar resolver) and is exported
from this package's client entry. That is the single source of truth:
`@openai-harness/client-ui-connectors` imports its copies from
`@openai-harness/client-ui-chat/client` instead of keeping its own. A session id
reaches the avatar as `sessionId` owner props, so the role color/glyph resolves
without a Next route read.

## Slots

Declared and rendered by this package (all `root`; see the note below):

| Slot | Kind | Owner props |
| --- | --- | --- |
| `conversation.header` | single | `HeaderOwnerProps` |
| `conversation.empty` | single | `EmptyOwnerProps` |
| `conversation.composer` | single | `ComposerOwnerProps` |
| `conversation.chat.node` | keyed | `ChatNodeOwnerProps` |
| `conversation.avatar` | single | `AvatarOwnerProps` |
| `conversation.loader` | single | `LoaderOwnerProps` |
| `conversation.thinking` | single | `ThinkingOwnerProps` |

`conversation.chat.node` reserves three keys:

- `turn` — the whole turn, including status banners and the usage footer.
- `user` — one user input, rendered as the brand bubble plus media.
- `assistant` — one settled answer (Markdown plus Generative UI blocks).

Generative UI and message media are rendered directly (via
`@openai-harness/client-ui-generative` and the attachment viewers). The sibling
plugins' seats (`conversation.chat.generative-ui`,
`conversation.chat.message.attachments`) are `session-maybe`, and the slot
renderer rejects a parent that declares a non-root child while no session-scope
adapter is installed. `@openai-harness/client-ui-session` currently installs
none, so this package declares only root children. Once that adapter ships,
declare the two sibling seats as `session-maybe` children and render them
through `renderSlot` with the inline renderers as fallbacks.

## State and transport

Stores and hooks come only from `@openai-harness/client-ui-session`
(`useChatStream`, `useSessionStore`, `useSidebarStore`, `useModalStore`,
`useConnectorStore`). The transcript fold (`foldEventsToTurns`,
`withAssistantStream`, `withOptimisticPrompts`) comes from
`@openai-harness/session-projection`. RPC (`session.update`) goes through the
session layer's configured `resolveRpcClient`.

The Next `useParams` read is gone: the active id arrives in plugin config as
`sessionId`. There are no `next/*` imports.

## What stays application-side

- `DetailBar` (and `src/components/detail.bar/**`): registers into the
  layout's root `rightbar` seat and reconstructs its data from
  `useChatStream` / the session stores.
- The Next route `/c/[sessionId]` and server fetching of the `SessionView`.
- `BotDollAvatar`, `BotDollLoader`, and `ChiefThinking` are no longer
  application-side: they live in `src/client/bot/**` and are registered here.
