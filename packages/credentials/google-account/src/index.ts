/**
 * Google account acquisition, identity, and filesystem-backed user storage.
 *
 * The package now owns both halves of a Google sign-in deployment:
 *
 * - the protocol primitives (`./oauth`) — authorization URL, code exchange,
 *   and OpenID userinfo;
 * - the application identity adapter (`./google`) — client-credential lookup,
 *   ID-token verification, and the redirect-flow identity shape;
 * - the filesystem user store (`./user-store`) — `<usersRoot>/<uuid>/user.json`
 *   plus the `.index/google-sub/<sub>` pointer, rooted at the project's
 *   `DATA_ROOT` (`./paths`);
 * - the user CRUD functions that replaced the application's `users.service`
 *   (`./users`);
 * - the OAuth route plugin (`./plugin`) that mounts `/auth/google` and
 *   `/api/auth/google` through `ctx.inject(['webServer'])`.
 *
 * The reference's workspace provisioner is intentionally absent: this
 * application keeps sessions, connectors, and attachments in its database and
 * data root rather than per-user workspace directories.
 *
 * @module @openai-harness/google-account
 */

export * from "./oauth";
export * from "./google";
export * from "./paths";
export * from "./user-store";
export * from "./users";
export { GoogleAccount, type GoogleAccountConfig } from "./plugin";
export { default } from "./plugin";
