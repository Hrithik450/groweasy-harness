/**
 * Whole-bar snapshot read.
 *
 * The bar is durable rows: a snapshot is the first page of every tab the
 * session owns, assembled into the shape the client renders.
 *
 * @module @/lib/detail.bar/snapshot
 */

import type { SessionId } from "@/lib/core/session/types";
import type { DetailBarState } from "@/lib/detail.bar/state";
import { getSessionById } from "@/lib/repositories/sessions.repo";
import { getDetailBarSnapshot } from "./service";

export async function getDetailBarState(
  sessionId: SessionId | string,
): Promise<DetailBarState> {
  const session = getSessionById(String(sessionId));
  if (!session?.slug) return {};
  return getDetailBarSnapshot(session);
}
