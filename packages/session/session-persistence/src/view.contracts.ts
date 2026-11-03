/**
 * Runtime contracts for session values crossing the server/client boundary.
 *
 * The event log itself is validated by the session event schema; only the
 * session view is re-validated here because it reaches client components over
 * HTTP.
 *
 * @module @openai-harness/session-persistence
 */

import { z } from "zod";
import type { SessionView } from "@openai-harness/session";

/** Validates a session as delivered to client components. */
export const sessionViewSchema: z.ZodType<SessionView> = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    slug: z.string().nullable(),
    hidden: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
