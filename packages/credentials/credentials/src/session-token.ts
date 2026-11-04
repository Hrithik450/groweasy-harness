/**
 * Auth-session token signing and verification.
 *
 * The token is a short-lived HS256 JWT carrying the application's session-user
 * snapshot. This module owns only the cryptographic half: the host supplies the
 * secret and the lifetime, reads its own environment, and decides which cookie
 * carries the result. That split is what lets the Next application and the
 * standalone gateway verify one token with the same code.
 *
 * @module @openai-harness/credentials
 */

import { SignJWT, jwtVerify } from "jose";
import type { AuthSessionUser } from "./types";

/** Default token lifetime when the host does not name one. */
export const DEFAULT_SESSION_EXPIRY = "7d";

/** What the host binds once: the signing secret and the token lifetime. */
export interface SessionTokenConfig {
  /** The HMAC secret, either raw bytes or the text the host read from its environment. */
  readonly secret: string | Uint8Array;
  /** JWT expiry, such as `"7d"` or a duration in seconds; defaults to `"7d"`. */
  readonly expiresIn?: string | number;
}

/**
 * An auth-session token issuer/verifier bound to one secret.
 *
 * Construct one per configuration; the class keeps no per-call state, so a host
 * that reads its secret lazily may construct a fresh instance per operation
 * without paying for anything but the key encoding.
 */
export class SessionTokens {
  private readonly key: Uint8Array;
  private readonly expiresIn: string | number;

  /**
   * @param config - the host's signing secret and, optionally, token lifetime.
   * @throws TypeError when the secret is empty.
   */
  constructor(config: SessionTokenConfig) {
    const key =
      typeof config.secret === "string"
        ? new TextEncoder().encode(config.secret)
        : config.secret;
    if (key.length === 0) {
      throw new TypeError("session token secret must not be empty");
    }
    this.key = key;
    this.expiresIn = config.expiresIn ?? DEFAULT_SESSION_EXPIRY;
  }

  /**
   * Sign a session-user snapshot into a JWT.
   *
   * @param user - the user facts to certify; serialized verbatim.
   * @returns the signed token.
   */
  async sign(user: AuthSessionUser): Promise<string> {
    return new SignJWT({ user })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.key);
  }

  /**
   * Verify a token and return the user it carries.
   *
   * @param token - the candidate JWT.
   * @returns the certified user, or null when the token is invalid, expired,
   *   or carries no user id.
   */
  async verify(token: string): Promise<AuthSessionUser | null> {
    try {
      const { payload } = await jwtVerify(token, this.key);
      const user = (payload as { user?: AuthSessionUser }).user;
      if (!user || typeof user.id !== "string" || user.id.length === 0) {
        return null;
      }
      return user;
    } catch {
      return null;
    }
  }
}
