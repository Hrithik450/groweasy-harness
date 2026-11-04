/**
 * User CRUD owned by the Google account package.
 *
 * These functions replace the application's former Drizzle-backed
 * `users.service`/`users.repo` pair. They keep the application's response
 * envelope and update semantics while reading and writing the filesystem
 * {@link UserStore} instead of a `users` table:
 *
 * - `getUserByUserId` matches the internal UUID first, then a Google id,
 *   exactly like the former `or(eq(users.id), eq(users.googleId))` query;
 * - `rebindUserWithGoogle` preserves the former transaction's decision order:
 *   an existing Google or email match wins, and a matching anonymous row is
 *   updated in place so its sessions and connector rows stay attached;
 * - `getUserByEmail` stays case-insensitive;
 * - `getUsers` returns newest first.
 *
 * The former service also seeded `DEFAULT_SESSIONS` when it created or
 * rebound a user. That seeding needs the application's SQLite session tables,
 * so it stays with the application; the package only owns the user record.
 *
 * @module @openai-harness/google-account/users
 */

import type { GoogleUserProfile } from "./oauth";
import { resolveUsersRoot } from "./paths";
import {
  UserStore,
  type NewStoredUser,
  type StoredUser,
} from "./user-store";

/**
 * Response envelope the application's service layer expects. The name is
 * deliberately distinct from the application's `Response` so the two barrels
 * that re-export this module do not shadow it.
 */
export interface UserOperationResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

let cachedStore: { readonly root: string; readonly store: UserStore } | undefined;

/**
 * The process-wide store for the currently resolved project root.
 *
 * The root is re-resolved on every call so a test that swaps `DATA_ROOT`
 * gets a store bound to the new directory.
 *
 * @returns the store rooted at {@link resolveUsersRoot}.
 */
export function getDefaultUserStore(): UserStore {
  const root = resolveUsersRoot();
  if (cachedStore?.root !== root) {
    cachedStore = { root, store: new UserStore(root) };
  }
  return cachedStore.store;
}

/** Convert a thrown value into the application's error envelope. */
function failure<T>(error: unknown): UserOperationResult<T> {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

/** Case-insensitive email lookup over the store's tenants. */
function findByEmail(
  store: UserStore,
  email: string,
): StoredUser | undefined {
  const target = email.trim().toLowerCase();
  if (!target) return undefined;
  return store
    .listUsers()
    .find((user) => (user.email ?? "").toLowerCase() === target);
}

/**
 * Create an anonymous guest record with the application's former defaults.
 *
 * @param store - store to write; defaults to the project-local store.
 * @returns the new record, or the failure envelope.
 */
export function createAnonymousUser(
  store: UserStore = getDefaultUserStore(),
): UserOperationResult<StoredUser> {
  return getOrCreateAnonymousUser(undefined, store);
}

/**
 * Ensure an anonymous record exists for the caller's stable id.
 *
 * The client's UUIDv7 is preserved when it is valid; otherwise a fresh one is
 * minted. An existing record is returned untouched, which is what lets a later
 * Google sign-in rebind it in place.
 *
 * @param preferredUserId - optional client-supplied UUIDv7.
 * @param store - store to read/write; defaults to the project-local store.
 * @returns the existing or newly created record, or the failure envelope.
 */
export function getOrCreateAnonymousUser(
  preferredUserId?: string,
  store: UserStore = getDefaultUserStore(),
): UserOperationResult<StoredUser> {
  try {
    const id = store.getOrCreateAnonymousId(preferredUserId);
    const existing = store.getUserById(id);
    if (existing) return { success: true, data: existing };

    const now = new Date().toISOString();
    const user: StoredUser = {
      id,
      googleId: null,
      email: null,
      name: "Anonymous",
      picture: null,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    };
    store.saveUser(user);
    return { success: true, data: user };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Rebind an existing anonymous record — or adopt an existing Google/email
 * match — with a verified Google identity.
 *
 * @param data - the identity facts and, when known, the record to rebind.
 * @param store - store to read/write; defaults to the project-local store.
 * @returns the record after the update, or the failure envelope.
 */
export function rebindUserWithGoogle(
  data: NewStoredUser,
  store: UserStore = getDefaultUserStore(),
): UserOperationResult<StoredUser> {
  try {
    const now = new Date().toISOString();

    const googleId = (data.googleId ?? "").trim();
    const email = (data.email ?? "").trim();
    const userId = data.id?.trim();

    let existingGoogleUser = googleId
      ? store.getUserByGoogleSub(googleId)
      : undefined;

    if (!existingGoogleUser && email) {
      existingGoogleUser = findByEmail(store, email);
    }

    if (existingGoogleUser) {
      if (userId && existingGoogleUser.id === userId) {
        existingGoogleUser.name = data.name ?? existingGoogleUser.name;
        existingGoogleUser.googleId = googleId;
        existingGoogleUser.picture =
          data.picture ?? existingGoogleUser.picture;
        existingGoogleUser.emailVerified =
          data.emailVerified ?? existingGoogleUser.emailVerified;
        existingGoogleUser.updatedAt = now;
        store.saveUser(existingGoogleUser);
      }
      return { success: true, data: existingGoogleUser };
    }

    if (!userId) {
      throw new Error("User ID is required to link Google account.");
    }

    const existingUser = store.getUserById(userId);
    if (!existingUser) {
      throw new Error("User record not found to link Google account.");
    }

    existingUser.email = email;
    existingUser.googleId = googleId;
    existingUser.name = data.name ?? existingUser.name ?? "User";
    existingUser.picture = data.picture ?? existingUser.picture;
    existingUser.emailVerified = data.emailVerified ?? true;
    existingUser.updatedAt = now;
    store.saveUser(existingUser);

    return { success: true, data: existingUser };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Look up a user by internal UUID or, failing that, Google id.
 *
 * @param id - a user UUIDv7 or a Google subject id.
 */
export function getUserByUserId(
  id: string,
): UserOperationResult<StoredUser | null> {
  try {
    const store = getDefaultUserStore();
    return {
      success: true,
      data: store.getUserById(id) ?? store.getUserByGoogleSub(id) ?? null,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Look up a user by email address, case-insensitively.
 *
 * @param email - the address to match.
 */
export function getUserByEmail(
  email: string,
): UserOperationResult<StoredUser | null> {
  try {
    return {
      success: true,
      data: findByEmail(getDefaultUserStore(), email) ?? null,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * List every stored user, newest first.
 */
export function getUsers(): UserOperationResult<StoredUser[]> {
  try {
    const users = getDefaultUserStore()
      .listUsers()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { success: true, data: users };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Preserve a client-supplied anonymous UUIDv7 or mint a fresh one.
 *
 * @param preferredUserId - optional client-supplied UUIDv7.
 */
export function getOrCreateAnonymousId(preferredUserId?: string): string {
  return getDefaultUserStore().getOrCreateAnonymousId(preferredUserId);
}

/**
 * Link a Google login to an established or freshly minted UUIDv7, mirroring
 * the reference store's `loginWithGoogle`.
 *
 * @param profile - Google userinfo returned by the OAuth flow.
 * @param preferredUserId - optional anonymous UUIDv7 to bind.
 */
export function loginWithGoogle(
  profile: GoogleUserProfile,
  preferredUserId?: string,
): StoredUser {
  return getDefaultUserStore().loginWithGoogle(profile, preferredUserId);
}
