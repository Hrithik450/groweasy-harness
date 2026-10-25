/**
 * High-performance O(1) multi-tenant user store.
 *
 * @module @deepseek-ai/dsh-google-account/user-store
 */

import { join } from "node:path";
import type { GoogleUserProfile } from "./oauth.ts";
import { uuidv7 } from "@deepseek-ai/dsh-util-crypto";
import { resolveWorkspacesRoot } from "./workspace-provisioner.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export interface StoredUser {
  id: string;
  googleSub?: string | undefined;
  email?: string | undefined;
  name?: string | undefined;
  picture?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

const UUIDV7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UserStore {
  private readonly workspacesRoot: string;
  private readonly indexSubDir: string;

  constructor() {
    this.workspacesRoot = resolveWorkspacesRoot();
    this.indexSubDir = join(this.workspacesRoot, ".index", "google-sub");
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    mkdirSync(this.workspacesRoot, { recursive: true });
    mkdirSync(this.indexSubDir, { recursive: true });
  }

  /**
   * Look up a user directly by UUIDv7 from their isolated tenant directory.
   * Time complexity: O(1) direct filesystem inode read.
   * Memory complexity: O(1) loads ONLY the requesting user.
   *
   * @param userId - User UUIDv7
   */
  getUserById(userId: string): StoredUser | undefined {
    if (!UUIDV7_PATTERN.test(userId)) return undefined;
    const userFile = join(this.workspacesRoot, userId, "user.json");
    if (!existsSync(userFile)) return undefined;
    try {
      const raw = readFileSync(userFile, "utf8");
      const parsed = JSON.parse(raw) as StoredUser;
      return parsed.id === userId ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Look up a user by Google Sub ID using an O(1) pointer file.
   *
   * @param sub - Google Sub ID (OpenID Subject claim)
   */
  getUserByGoogleSub(sub: string): StoredUser | undefined {
    if (!sub || typeof sub !== "string") return undefined;
    const pointerFile = join(this.indexSubDir, sub);
    if (!existsSync(pointerFile)) return undefined;
    try {
      const userId = readFileSync(pointerFile, "utf8").trim();
      return this.getUserById(userId);
    } catch {
      return undefined;
    }
  }

  /**
   * Save or update an individual user record and update their sub index pointer.
   *
   * @param user - StoredUser record
   */
  saveUser(user: StoredUser): void {
    if (!UUIDV7_PATTERN.test(user.id)) return;
    const userDir = join(this.workspacesRoot, user.id);
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, "user.json"), JSON.stringify(user, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });

    if (user.googleSub) {
      mkdirSync(this.indexSubDir, { recursive: true });
      writeFileSync(join(this.indexSubDir, user.googleSub), user.id, {
        encoding: "utf8",
        mode: 0o600,
      });
    }
  }

  /**
   * Get or mint an anonymous guest UUIDv7.
   * If a client supplies a valid `preferredUserId`, it is preserved; otherwise a fresh UUIDv7 is minted.
   * Does NOT write any global server file, ensuring pure per-session multi-tenant isolation.
   *
   * @param preferredUserId - Optional client-supplied anonymous UUIDv7
   */
  getOrCreateAnonymousId(preferredUserId?: string): string {
    if (preferredUserId && UUIDV7_PATTERN.test(preferredUserId)) {
      return preferredUserId;
    }
    return uuidv7();
  }

  /**
   * Link a Google login to an established or new UUIDv7.
   *
   * @param profile - Google profile returned by OAuth userinfo
   * @param preferredUserId - Optional client-supplied anonymous UUIDv7 to bind
   */
  loginWithGoogle(
    profile: GoogleUserProfile,
    preferredUserId?: string,
  ): StoredUser {
    const existingUser = this.getUserByGoogleSub(profile.sub);
    const now = new Date().toISOString();

    if (existingUser) {
      existingUser.name = profile.name;
      existingUser.picture = profile.picture;
      existingUser.email = profile.email;
      existingUser.updatedAt = now;
      this.saveUser(existingUser);
      return existingUser;
    }

    const validPreferred =
      preferredUserId && UUIDV7_PATTERN.test(preferredUserId);
    let userId: string;
    if (validPreferred) {
      const existingRecord = this.getUserById(preferredUserId);
      if (
        existingRecord &&
        existingRecord.googleSub &&
        existingRecord.googleSub !== profile.sub
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
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      createdAt: now,
      updatedAt: now,
    };

    this.saveUser(newUser);

    return newUser;
  }

  /**
   * Retrieve the current user.
   * Fetches the user record matching the request's client context or cookie `preferredUserId`.
   *
   * @param preferredUserId - User UUIDv7 from request context
   */
  getCurrentUser(preferredUserId?: string): StoredUser | undefined {
    if (preferredUserId && UUIDV7_PATTERN.test(preferredUserId)) {
      return this.getUserById(preferredUserId);
    }
    return undefined;
  }

  /**
   * Clear user session state.
   */
  signOut(_userId?: string): void {}
}
