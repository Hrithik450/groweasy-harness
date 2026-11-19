/**
 * Channel keys for the server stream bus.
 *
 * The bus treats keys as opaque; naming them lives here so producers and the
 * writer cannot drift apart.
 *
 * @module @/lib/session/keys
 */

export const sessionKey = (sessionId: string): string => `session:${sessionId}`;

export const userKey = (userId: string): string => `user:${userId}`;
