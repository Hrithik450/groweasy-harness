/** Session read-model contracts shared by the controller and the UI. */

import { z } from "zod";

export { toSessionView } from "@/lib/core/session/view";
export type { SessionView } from "@/lib/core/session/view";

/** Shape the client validates a projected session against. */
export const sessionViewSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    events: z.array(z.unknown()).optional(),
  })
  .passthrough();
