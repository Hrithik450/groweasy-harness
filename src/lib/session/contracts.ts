/** Session read-model contracts shared by the controller and the UI. */

import { z } from "zod";

/** Shape the client validates a session payload against. */
export const sessionSchema = z
  .object({
    id: z.string(),
    title: z.string().optional(),
    events: z.array(z.unknown()).optional(),
  })
  .passthrough();
