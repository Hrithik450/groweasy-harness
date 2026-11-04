/**
 * Filesystem-backed multi-tenant user store.
 *
 * Mirrors `packages/credentials/google-account/src/user-store.ts` in the
 * reference deepseek-harness repository: one directory per user, an O(1)
 * Google-subject pointer, and no global users index file. The differences are
 * the ones this application requires:
 *
 * - the root is project-local (`resolveUsersRoot()`, honouring `DATA_ROOT`)
 *   rather than the reference's workspaces root under `$HOME`;
 * - the stored record keeps the application's `googleId` spelling while the
 *   on-disk pointer directory stays `.index/google-sub/<sub>`;
 * - `listUsers`/`getUsers` exist because the application's `users.service`
 *   exposed an enumeration the reference's store never needed.
 *
 * Layout:
 * ```
 * <usersRoot>/<uuidv7>/user.json
 * <usersRoot>/.index/google-sub/<google-sub>
 * ```
 *
 * `user.json` and the pointer are written with mode `0600`.
 *
 * @module @openai-harness/google-account/user-store
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { uuidv7 } from "@openai-harness/uuid";
import type { GoogleUserProfile } from "./oauth";
import { resolveUsersRoot } from "./paths";

/** One persisted account record. */
export interface StoredUser {
  /** Stable UUIDv7 identity; also the tenant directory name. */
  id: string;
  /** Google OpenID subject claim once linked; null for anonymous users. */
  googleId: string | null;
  /** Confirmed email address, when Google supplied one. */
  email: string | null;
  /** Display name. */
  name: string | null;
  /** Avatar URL, when Google supplied one. */
  picture: string | null;
  /** Whether Google reported the email as verified. */
  emailVerified: boolean | null;
  /** Creation timestamp, ISO 8601. */
  createdAt: string;
  /** Last-update timestamp, ISO 8601. */
  updatedAt: string;
}

/** The mutable input accepted when rebinding a record to a Google identity. */
export interface NewStoredUser {
  id?: string | null;
  googleId?: string | null;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  emailVerified?: boolean | null;
}

const UUIDV7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a string can name a tenant directory. */
function isUserDirectoryName(value: string): boolean {
  return UUIDV7_PATTERN.test(value);
}

/** Whether a Google subject is safe to use as a single index filename. */
function isSafeIndexKey(value: string): boolean {
  return (
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !value.includes("\\")
  );
}

/**
 * Read/write account records below one root directory.
 *
 * The store is intentionally synchronous: every operation is a direct inode
 * read or one small file write, which is what keeps the reference's O(1)
 * lookup property.
 */
export class UserStore {
  private readonly usersRoot: string;
  private readonly indexSubDir: string;

  /**
   * @param usersRoot - directory holding one `<uuid>/user.json` per user;
   *   defaults to the project-local {@link resolveUsersRoot} root.
   */
  constructor(usersRoot: string = resolveUsersRoot()) {
    this.usersRoot = usersRoot;
    this.indexSubDir = join(this.usersRoot, ".index", "google-sub");
    this.ensureDirectories();
  }

  /** The root this store reads and writes. */
  get root(): string {
    return this.usersRoot;
  }

  private ensureDirectories(): void {
    mkdirSync(this.usersRoot, { recursive: true });
    mkdirSync(this.indexSubDir, { recursive: true });
  }

  /**
   * Look up a user directly by UUIDv7 from their tenant directory.
   *
   * @param userId - user UUIDv7.
   * @returns the record, or undefined when the id is invalid or absent.
   */
  getUserById(userId: string): StoredUser | undefined {
    if (!isUserDirectoryName(userId)) return undefined;
    const userFile = join(this.usersRoot, userId, "user.json");
    if (!existsSync(userFile)) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(userFile, "utf8")) as StoredUser;
      return parsed.id === userId ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Look up a user by Google subject id through the O(1) pointer file.
   *
   * @param sub - Google OpenID subject claim.
   * @returns the record, or undefined when the pointer is absent or stale.
   */
  getUserByGoogleSub(sub: string): StoredUser | undefined {
    if (typeof sub !== "string" || !isSafeIndexKey(sub)) return undefined;
    const pointerFile = join(this.indexSubDir, sub);
    if (!existsSync(pointerFile)) return undefined;
    try {
      return this.getUserById(readFileSync(pointerFile, "utf8").trim());
    } catch {
      return undefined;
    }
  }

  /**
   * Alias for {@link getUserByGoogleSub} using the application's field name.
   *
   * @param googleId - Google OpenID subject claim.
   */
  getUserByGoogleId(googleId: string): StoredUser | undefined {
    return this.getUserByGoogleSub(googleId);
  }

  /**
   * Save or update one record and refresh its Google-subject pointer.
   *
   * @param user - the record to persist; the id must be a UUIDv7.
   */
  saveUser(user: StoredUser): void {
    if (!isUserDirectoryName(user.id)) return;
    const userDir = join(this.usersRoot, user.id);
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, "user.json"), JSON.stringify(user, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });

    if (user.googleId && isSafeIndexKey(user.googleId)) {
      mkdirSync(this.indexSubDir, { recursive: true });
      writeFileSync(join(this.indexSubDir, user.googleId), user.id, {
        encoding: "utf8",
        mode: 0o600,
      });
    }
  }

  /**
   * Enumerate every readable tenant record.
   *
   * The `.index` directory is skipped because it is not a tenant.
   *
   * @returns the records in filesystem order; callers sort as needed.
   */
  listUsers(): StoredUser[] {
    if (!existsSync(this.usersRoot)) return [];
    const users: StoredUser[] = [];
    for (const entry of readdirSync(this.usersRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !isUserDirectoryName(entry.name)) continue;
      const user = this.getUserById(entry.name);
      if (user !== undefined) users.push(user);
    }
    return users;
  }

  /**
   * Preserve a client-supplied anonymous UUIDv7 or mint a fresh one.
   *
   * This never writes a record, matching the reference's per-session
   * isolation.
   *
   * @param preferredUserId - optional client-supplied UUIDv7.
   * @returns the accepted or freshly minted id.
   */
  getOrCreateAnonymousId(preferredUserId?: string): string {
    if (preferredUserId && isUserDirectoryName(preferredUserId)) {
      return preferredUserId;
    }
    return uuidv7();
  }

  /**
   * Link a Google login to an established or new UUIDv7.
   *
   * @param profile - Google userinfo returned by the OAuth flow.
   * @param preferredUserId - optional anonymous UUIDv7 to bind.
   * @returns the stored record after the write.
   */
  loginWithGoogle(
    profile: GoogleUserProfile,
    preferredUserId?: string,
  ): StoredUser {
    const existingUser = this.getUserByGoogleSub(profile.sub);
    const now = new Date().toISOString();

    if (existingUser) {
      existingUser.name = profile.name;
      existingUser.picture = profile.picture ?? null;
      existingUser.email = profile.email;
      existingUser.emailVerified = profile.emailVerified ?? null;
      existingUser.updatedAt = now;
      this.saveUser(existingUser);
      return existingUser;
    }

    let userId: string;
    if (
      preferredUserId !== undefined &&
      isUserDirectoryName(preferredUserId)
    ) {
      const existingRecord = this.getUserById(preferredUserId);
      if (
        existingRecord &&
        existingRecord.googleId &&
        existingRecord.googleId !== profile.sub
      ) {
        userId = uuidv7();
      } else {
        userId = preferredUserId;
      }
    } else {
      userId = uuidv7();
    }

    const newUser: StoredUser = {
      id: userId,
      googleId: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture ?? null,
      emailVerified: profile.emailVerified ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.saveUser(newUser);
    return newUser;
  }

  /**
   * Read the record a request's preferred user id names.
   *
   * @param preferredUserId - user UUIDv7 from the request context.
   */
  getCurrentUser(preferredUserId?: string): StoredUser | undefined {
    if (preferredUserId && isUserDirectoryName(preferredUserId)) {
      return this.getUserById(preferredUserId);
    }
    return undefined;
  }

  /**
   * Session-state clear hook. The filesystem store keeps no session state,
   * matching the reference.
   */
  signOut(_userId?: string): void {}
}
