/**
 * The URL contract for media that the UI renders.
 *
 * A block component renders `src` directly in the browser, so the value must
 * be one the browser can fetch: our attachment route, or a remote https URL.
 * A local path is valid for a tool's own use, never for a block.
 *
 * @module @/lib/attachments/asset.url
 */

/** Path prefix that streams a durable attachment. */
const ATTACHMENT_PREFIX = "/api/attachments/";

/** Whether a string can be rendered by an `Image`/`Video`/media block. */
export function isRenderableAssetUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (url.length === 0) return false;
  if (url.startsWith(ATTACHMENT_PREFIX)) return url.length > ATTACHMENT_PREFIX.length;
  return /^https?:\/\/\S+$/i.test(url);
}

/** The attachment route for one durable id. */
export function attachmentUrl(attachmentId: string): string {
  return `${ATTACHMENT_PREFIX}${attachmentId}`;
}
