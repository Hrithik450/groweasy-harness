import { resolveSession } from "@/lib/repositories/sessions.repo";
import type { Session } from "@/lib/db";

/**
 * Resolves or creates a dedicated session for any agent workflow.
 * Delegates the database query and creation to the repository layer.
 */
export async function resolveAgentSession(options: {
  userId: string;
  slug: string;
  title: string;
  reuse?: boolean;
  hidden?: boolean;
}): Promise<Session> {
  return resolveSession(options);
}
