import {
  getUsers,
  getUserByUserId,
  getUserByEmail,
  createUser,
} from "@/lib/repositories";
import type { User, NewUser, PublicUser } from "@/lib/db";
import { toPublicUser } from "./session";

/**
 * Reads all users from SQLite database
 */
export async function getAllUsers(): Promise<PublicUser[]> {
  return getUsers().map(toPublicUser);
}

/**
 * Finds user by internal UUIDv7 id or Google ID
 */
export async function findUserById(id: string): Promise<PublicUser | null> {
  const user = getUserByUserId(id);
  return user ? toPublicUser(user) : null;
}

/**
 * Finds user by email address
 */
export async function findUserByEmail(
  email: string,
): Promise<PublicUser | null> {
  const user = getUserByEmail(email);
  return user ? toPublicUser(user) : null;
}

/**
 * Auth-internal credential lookup. Returns the full row including the
 * password hash; never hand this result to a client.
 */
export async function findUserCredentialsByEmail(
  email: string,
): Promise<User | null> {
  return getUserByEmail(email);
}

/**
 * Finds or creates a user from verified Google OAuth credentials in SQLite.
 * Accepts the strongly-typed Drizzle NewUser.
 */
export async function findOrCreateGoogleUser(
  data: NewUser,
): Promise<{ user: PublicUser; created: boolean }> {
  const { user, created } = createUser(data);
  return { user: toPublicUser(user), created };
}
