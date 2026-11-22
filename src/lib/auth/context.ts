import type { User } from "@/lib/db/types";
import { AsyncLocalStorage } from "node:async_hooks";

export const userContextStorage = new AsyncLocalStorage<User>();

/**
 * Returns the active user ID for the current async call stack if available.
 */
export function getCurrentUserId(): string | undefined {
  return userContextStorage.getStore()?.id;
}

/**
 * Returns the active user record for the current async call stack if available.
 */
export function getCurrentUser(): User | undefined {
  return userContextStorage.getStore();
}

/**
 * Wraps an async or sync execution block with the given user context.
 */
export function runWithUserContext<T>(user: User, fn: () => T): T {
  return userContextStorage.run(user, fn);
}
