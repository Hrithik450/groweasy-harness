/**
 * Whole-bar snapshot read.
 *
 * The bar is durable rows: a snapshot is the first page of every tab the
 * session owns, assembled into the shape the client renders.
 *
 * @module @/lib/bar/snapshot
 */

import type { SessionId } from "@/lib/core/session/types";
import type { DetailBarState } from "@/lib/detail.bar/state";
import { getSessionById } from "@/lib/repositories/sessions.repo";
import { readBarSnapshot } from "./service";

export async function readBarState(
  sessionId: SessionId | string,
): Promise<DetailBarState> {
  const session = getSessionById(String(sessionId));
  if (!session?.slug) return {};
  return readBarSnapshot(session);
}
