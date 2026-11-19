import {
  getUsers,
  getUserByUserId,
  getUserByEmail,
  createUser,
} from "@/lib/repositories/users.repo";
import type { UserRecord, NewUserRecord } from "@/lib/db";

export type { UserRecord, NewUserRecord } from "@/lib/db";

/**
 * Reads all users from SQLite database
 */
export async function getAllUsers(): Promise<UserRecord[]> {
  return getUsers();
}

/**
 * Finds user by internal UUIDv7 id or Google ID
 */
export async function findUserById(id: string): Promise<UserRecord | null> {
  return getUserByUserId(id);
}

/**
 * Finds user by email address
 */
export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  return getUserByEmail(email);
}

/**
 * Finds or creates a user from verified Google OAuth credentials in SQLite.
 * Accepts the strongly-typed Drizzle NewUserRecord.
 */
export async function findOrCreateGoogleUser(
  data: NewUserRecord,
): Promise<{ user: UserRecord; created: boolean }> {
  return createUser(data);
}
