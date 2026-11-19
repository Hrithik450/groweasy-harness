/**
 * Server-side resolution of submitted UI blocks.
 *
 * The client only sends a block id; the spec a user saw must come from the
 * durable `ui/block` event the server wrote, never from the request.
 *
 * @module @/lib/session/blocks
 */

import type { SessionEvent } from "@/lib/core/session/events";
import type { SessionId } from "@/lib/core/session/types";
import type { UIBlockSpec } from "@/lib/generative.ui";
import { sessionEventsRepo } from "./persistence/events.repo";

/** Find the spec the server rendered for a block id. */
export function findUIBlockSpec(
  events: readonly SessionEvent[],
  blockId: string,
): UIBlockSpec | undefined {
  for (const event of events) {
    if (event.type !== "ui/block") continue;
    // Older events carry the id only inside the spec, so accept either.
    if (event.data.id === blockId || event.data.spec?.id === blockId) {
      return event.data.spec;
    }
  }
  return undefined;
}
