import * as repo from "@/lib/repositories";
import { DEFAULT_SESSIONS } from "./default";
import type { Response } from "./types";
import type { User, NewUser } from "@/lib/db";

/**
 * Creates an anonymous guest user and seeds default sessions.
 */
export async function createAnonymousUser(): Promise<Response<User>> {
  try {
    const user = repo.createAnonymousUser();
    repo.ensureDefaultSessionsByUserId(user.id, DEFAULT_SESSIONS);
    return { success: true, data: user };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Rebinds an existing user row (e.g. anonymous user) with Google OAuth identity.
 */
export async function rebindUserWithGoogle(
  data: NewUser,
): Promise<Response<User>> {
  try {
    const user = repo.rebindUserWithGoogle(data);
    repo.ensureDefaultSessionsByUserId(user.id, DEFAULT_SESSIONS);
    return { success: true, data: user };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves a user by their internal UUID or Google ID.
 */
export async function getUserByUserId(
  id: string,
): Promise<Response<User | null>> {
  try {
    const data = repo.getUserByUserId(id);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves a user by their email address.
 */
export async function getUserByEmail(
  email: string,
): Promise<Response<User | null>> {
  try {
    const data = repo.getUserByEmail(email);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Retrieves all registered users ordered by creation date.
 */
export async function getUsers(): Promise<Response<User[]>> {
  try {
    const data = repo.getUsers();
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
