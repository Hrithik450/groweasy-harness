# @openai-harness/credentials

Framework-free authentication primitives: the auth-session JWT and durable
credential records over a host-supplied store.

What it owns:

- `SessionTokens` — HS256 signing and verification of the session JWT that
  carries an `AuthSessionUser` snapshot. The host supplies the secret and
  lifetime; the package supplies the cryptography.
- The credential-key grammar — `credentialKey` / `parseCredentialKey` and the
  scope/id readers, where a key is `<scope>/<id>`.
- The stored-record vocabulary — `ApiKeyRecord`, `GrantRecord`, and the
  value-free `CredentialRecordInfo` / `CredentialRecordEntry` views.
- `CredentialRecords` — `readRecord`, `describeRecord`, `listRecords`,
  `modifyRecord`, and `deleteRecord` over a `CredentialStore`.

What it does not own:

- Cookies, request parsing, redirects, and environment reading. The application
  keeps those in `src/lib/auth/session.ts`, `src/lib/auth/token.ts`, and the
  `src/app/api/auth/**` routes.
- The database client, table definitions, and cross-process locking. The host
  binds them through `CredentialStore`, passed to the constructor or registered
  once with `configureCredentialStore`.
- Secret resolution from environment-variable references. This application has
  no settings surface that names credentials by reference, so the reference half
  of the reference repository's seam is deliberately absent.

## Host binding

```ts
import {
  CredentialRecords,
  SessionTokens,
  configureCredentialStore,
} from "@openai-harness/credentials";

configureCredentialStore(drizzleCredentialStore);

const records = new CredentialRecords(); // uses the configured store
const tokens = new SessionTokens({ secret: process.env.AUTH_SECRET!, expiresIn: "7d" });
```

`modifyRecord` serializes writers per key inside one process. A backing store
that supports cross-process exclusion must hold its own lock; a token refresh in
two processes would otherwise lose whichever wrote first.

The store seam mirrors `@openai-harness/session-persistence`: an interface the
host satisfies, a module-level `configure...` binding, and a class whose
constructor defaults to that binding.

Source reference: `packages/credentials/credentials` in the reference
deepseek-harness repository.
