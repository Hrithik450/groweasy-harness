import { and, inArray, isNull, lt } from "drizzle-orm";
import { attachmentReceipts, getDb } from "@/lib/db";

/**
 * Record an upload receipt so a later prompt can claim it.
 *
 * Re-uploading the same bytes yields the same id, so an unbound row is
 * re-dated: otherwise the sweep could collect a file the user just re-picked.
 * A bound row keeps its claim.
 */
export function recordReceipt(id: string): void {
  const now = new Date().toISOString();
  getDb()
    .insert(attachmentReceipts)
    .values({ id, createdAt: now })
    .onConflictDoUpdate({
      target: attachmentReceipts.id,
      set: { createdAt: now },
      setWhere: isNull(attachmentReceipts.boundAt),
    })
    .run();
}

/** Claim unbound receipts for the prompt that used them. */
export function bindReceipts(
  ids: readonly string[],
  where: { sessionId: string; requestId: string },
): void {
  if (ids.length === 0) return;

  getDb()
    .update(attachmentReceipts)
    .set({
      boundAt: new Date().toISOString(),
      sessionId: where.sessionId,
      requestId: where.requestId,
    })
    .where(
      and(
        inArray(attachmentReceipts.id, [...ids]),
        isNull(attachmentReceipts.boundAt),
      ),
    )
    .run();
}

/** Unbound receipt ids recorded before the given ISO timestamp. */
export function listUnboundOlderThan(iso: string): string[] {
  return getDb()
    .select({ id: attachmentReceipts.id })
    .from(attachmentReceipts)
    .where(
      and(
        isNull(attachmentReceipts.boundAt),
        lt(attachmentReceipts.createdAt, iso),
      ),
    )
    .all()
    .map((row) => row.id);
}

/** Drop receipt rows, used after their object is gone or gone from storage. */
export function forgetReceipts(ids: readonly string[]): void {
  if (ids.length === 0) return;

  getDb()
    .delete(attachmentReceipts)
    .where(inArray(attachmentReceipts.id, [...ids]))
    .run();
}
