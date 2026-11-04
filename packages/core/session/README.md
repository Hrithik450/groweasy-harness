# @openai-harness/session

Durable session vocabulary: identities and event positions, the format-versioned
header, the session event map, compaction payloads, and the wire-safe view
handed to clients.

What it owns:
- the `SessionId`, `SessionSeq`, and `SessionLogOffset` brands, plus
  `SESSION_FORMAT_VERSION`, `SessionHeader`, and `SessionPersistenceSnapshot`;
- `SessionEventMap` and `SessionEvent`, including turn, step, message, tool,
  request-header and request-context, UI-block, deliverable, session,
  detail-bar, and agent-inbox events;
- `CompactionCheckpointEventData` and `CompactionPruneEventData`;
- `SessionView`, `SessionMessageView`, and `UserView`.

What it does not own:
- persistence, derivation, or projection — the session service and store stay
  in the application;
- the compaction engine, its configuration, selection, or summarizer;
- the server-side mapper that produces a `SessionView` from a storage row.

Source references: the `SessionEventMap` and identifier vocabulary in
`packages/core/session` of the reference deepseek-harness repository. The
`SessionView`, `SessionMessageView`, and `UserView` wire shapes are this
repository's own client boundary.
