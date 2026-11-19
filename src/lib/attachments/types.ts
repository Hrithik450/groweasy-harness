export * from "./core/types";

import type { AttachmentRef } from "./core/types";

/**
 * Server-only storage row. Never serialized to the client.
 * `storageKey` is backend-specific (local path, object key, …).
 */
export type AttachmentRecord = AttachmentRef & {
  storageKey: string;
  createdAt: string;
};
