/**
 * Bar documents: one row per tab holding that tab's cards as JSON.
 *
 * @module @/lib/bar/docs.repo
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/database";
import { barDocs } from "@/lib/db/schema/schema";

/** One card as stored; `id` is always present. */
export type BarCard = Record<string, unknown> & { id: string };

/** Read one tab's cards, or `null` before the tab was ever written. */
export function readBarDoc(sessionId: string, field: string): BarCard[] | null {
  const row = getDb()
    .select()
    .from(barDocs)
    .where(and(eq(barDocs.sessionId, sessionId), eq(barDocs.field, field)))
    .get();
  return (row?.data as BarCard[] | undefined) ?? null;
}

/** Replace one tab's cards. */
export function writeBarDoc(
  sessionId: string,
  field: string,
  data: readonly BarCard[],
): void {
  const updatedAt = new Date().toISOString();
  getDb()
    .insert(barDocs)
    .values({ sessionId, field, data: [...data], updatedAt })
    .onConflictDoUpdate({
      target: [barDocs.sessionId, barDocs.field],
      set: { data: [...data], updatedAt },
    })
    .run();
}
