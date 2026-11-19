import { AttachmentId, type AttachmentRef } from "./core";
import { getAttachmentStore } from "./host";
import { forgetReceipts, listUnboundOlderThan } from "./receipts.repo";

/** Abandoned uploads are swept after a day. */
const RECEIPT_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Delete uploaded objects whose prompt never claimed them.
 * Bound receipts are never touched.
 */
export async function sweepOrphanedReceipts(): Promise<number> {
  const cutoff = new Date(Date.now() - RECEIPT_RETENTION_MS).toISOString();
  const ids = listUnboundOlderThan(cutoff);
  if (ids.length === 0) return 0;

  const store = getAttachmentStore();
  const swept: string[] = [];
  let deleted = 0;

  for (const id of ids) {
    let ref: AttachmentRef | null;
    try {
      ref = await store.resolveReceipt(AttachmentId(id));
    } catch (error) {
      console.error(
        `[Attachments Sweep] Failed to resolve receipt ${id}:`,
        error,
      );
      continue;
    }

    if (!ref) {
      swept.push(id);
      continue;
    }

    const removed = await store.deleteAttachment(ref);
    if (!removed) continue; // Keep the row so the next sweep retries.

    swept.push(id);
    deleted += 1;
  }

  forgetReceipts(swept);
  return deleted;
}
