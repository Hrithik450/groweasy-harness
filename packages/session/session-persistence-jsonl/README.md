---
description: "Append-only JSONL backend for session logs, one header line plus contiguous events."
kind: "package-reference"
---

# @openai-harness/session-persistence-jsonl

## Summary

Implements the JSONL session backend: one header line followed by contiguous
keyed events, atomic publish, and a lease so two processes cannot append to the
same session at once.

The backend is mounted by the host with the deployment's session root:

```ts
import { JsonlSessionPersistenceBackend, configureSessionPersistenceBackend } from "@openai-harness/session-persistence";

const backend = new JsonlSessionPersistenceBackend({ root: dataPath("sessions") });
configureSessionPersistenceBackend(backend);
```

Storage choice is the host's, not the package's: no default root is assumed.
